# RPC Contracts — Money Functions (Supabase)

Each function is a single-transaction Postgres function (Article I) invoked via Supabase RPC
from `@erp/web`. Inputs are validated with **Zod at the boundary** (Article XI) before the
RPC call; outputs are validated on return. Schemas live in `@erp/shared`. Money is
`NUMERIC(14,2)` SDG; amounts cross the wire as decimal **strings** to avoid float (Article I).
Every mutating call carries an `idempotency_key`. All calls are tenant-scoped by RLS — the
caller's `school_id` is resolved server-side, never trusted from the client.

Common Zod primitives:

```ts
const Money = z.string().regex(/^\d{1,12}(\.\d{1,2})?$/);   // NUMERIC(14,2) as string
const IdempotencyKey = z.string().uuid();
const Uuid = z.string().uuid();
```

---

## `apply_fee_payment`

Applies a (partial) payment to installment(s), oldest-outstanding first by default; prevents
an installment running balance from going negative; assigns the next per-school gapless
receipt number in-transaction; writes the audit entry. (FR-021/022/023; SC-003; Article I.)

**Input**
```ts
const ApplyFeePaymentInput = z.object({
  student_id: Uuid,
  account_id: Uuid,                       // receiving cash/bank account
  amount: Money,                          // total payment
  allocations: z.array(z.object({         // optional explicit targeting; default = oldest-first
    installment_id: Uuid,
    amount: Money,
  })).optional(),
  attachment_path: z.string().optional(), // Supabase Storage key (see storage-contract)
  occurred_at: z.string().datetime(),     // UTC; rendered Africa/Khartoum
  idempotency_key: IdempotencyKey,
});
```
**Output**
```ts
const ApplyFeePaymentOutput = z.object({
  money_event_id: Uuid,
  receipt_no: z.number().int().positive(),   // per-school gapless
  account_balance_after: Money,
  student_balance_after: Money,
  allocations: z.array(z.object({ installment_id: Uuid, running_balance_after: Money })),
});
```
**Errors**: `INSUFFICIENT_ALLOCATION_TARGET`, `OVERPAYMENT_BLOCKED` (running balance would go
negative), `WRITES_GATED` (school in grace/locked), `IDEMPOTENT_REPLAY` (returns prior result).

---

## `record_expense`

Posts money out from one account with a category. (FR-024.)
```ts
const RecordExpenseInput = z.object({
  account_id: Uuid, amount: Money, category: z.string().min(1),
  vendor: z.string().optional(), description: z.string().optional(),
  attachment_path: z.string().optional(), occurred_at: z.string().datetime(),
  idempotency_key: IdempotencyKey,
});
const RecordExpenseOutput = z.object({ money_event_id: Uuid, account_balance_after: Money });
```

## `record_transfer`

Neutral inter-account transfer; both balances move, counts as neither income nor expense.
(FR-025.)
```ts
const RecordTransferInput = z.object({
  from_account_id: Uuid, to_account_id: Uuid, amount: Money,
  description: z.string().optional(), occurred_at: z.string().datetime(),
  idempotency_key: IdempotencyKey,
}).refine(v => v.from_account_id !== v.to_account_id, 'accounts must differ');
const RecordTransferOutput = z.object({
  money_event_id: Uuid, from_balance_after: Money, to_balance_after: Money,
});
```

## `record_refund`

Money out to a guardian; adjusts the student ledger; not counted as an expense. (FR-026.)
```ts
const RecordRefundInput = z.object({
  student_id: Uuid, account_id: Uuid, amount: Money,
  description: z.string().optional(), attachment_path: z.string().optional(),
  occurred_at: z.string().datetime(), idempotency_key: IdempotencyKey,
});
const RecordRefundOutput = z.object({
  money_event_id: Uuid, account_balance_after: Money, student_balance_after: Money,
});
```

## `record_adjustment`

Write-off/adjustment that changes what a student owes; audited, never a silent edit. (FR-027.)
```ts
const RecordAdjustmentInput = z.object({
  student_id: Uuid, amount: Money,           // signed reduction/increase per convention
  reason: z.string().min(1), occurred_at: z.string().datetime(),
  idempotency_key: IdempotencyKey,
});
const RecordAdjustmentOutput = z.object({ money_event_id: Uuid, student_balance_after: Money });
```

## `apply_discount`

Non-cash reduction of a student's charge (percentage/fixed/sibling waiver); audited; visible
on statement; no cash moves. (FR-019/028.)
```ts
const ApplyDiscountInput = z.object({
  student_id: Uuid,
  kind: z.enum(['percentage', 'fixed', 'sibling_waiver']),
  value: Money,                              // percent (e.g. "10.00") or fixed SDG
  installment_id: Uuid.optional(),           // target, else applied per rule
  reason: z.string().optional(), idempotency_key: IdempotencyKey,
});
const ApplyDiscountOutput = z.object({
  discount_id: Uuid, computed_amount: Money, student_balance_after: Money,
});
```

---

## Reversing entries (corrections)

Corrections to any posted event are a new posting that references the original. No dedicated
function per type beyond a generic reverser; the original and reversal both remain visible.
(Article III; Edge "Reversal of a wrong event".)
```ts
const ReverseEventInput = z.object({
  money_event_id: Uuid, reason: z.string().min(1), idempotency_key: IdempotencyKey,
});
const ReverseEventOutput = z.object({
  reversing_event_id: Uuid, reverses_event_id: Uuid,
});
```

---

## SMS credit functions

### `topup_sms_credit` (super-admin only)
Adds credit; logs amount/who/when. (FR-037.)
```ts
const TopupSmsCreditInput = z.object({
  school_id: Uuid, amount: z.number().int().positive(), idempotency_key: IdempotencyKey,
});
const TopupSmsCreditOutput = z.object({ topup_id: Uuid, credit_balance_after: z.number().int() });
```

### `consume_sms_credit`
Decrements credit by **segment count**, atomically with the send; credit can never go
negative or be charged twice. Called by the dispatch worker as part of the send. (FR-039/040;
Article VII.)
```ts
const ConsumeSmsCreditInput = z.object({
  school_id: Uuid, sms_message_id: Uuid,
  segments: z.number().int().positive(),     // Arabic Unicode ~70 chars/segment, from @erp/shared
  idempotency_key: IdempotencyKey,
});
const ConsumeSmsCreditOutput = z.object({
  consumption_id: Uuid, credit_balance_after: z.number().int(),   // ≥ 0 always
});
```
**Errors**: `INSUFFICIENT_CREDIT` (no decrement, no send — caller skips + alerts),
`DISPATCH_PAUSED` (school in grace/locked), `IDEMPOTENT_REPLAY`.

---

## Write-gating (all mutating RPCs)

Every money/credit-consuming RPC enforces subscription lifecycle at the DB layer: rejects
with `WRITES_GATED` / `DISPATCH_PAUSED` when the school is in **grace** or **locked** state
(FR-035/036/043). The UI also gates, but the DB is the authority (Article IV).

import { z } from 'zod';
import { Money, Uuid, IdempotencyKey } from './primitives.js';

/**
 * Money RPC i/o schemas (US3/US4). Amounts cross the wire as decimal strings
 * (Article I). These mirror the rpc-contracts.md signatures; the server actions
 * map them to the Postgres `p_*` arg names before calling `callRpc`.
 */

// ── apply_fee_payment (US3) ──────────────────────────────────────────────────
export const PaymentAllocation = z.object({
  installment_id: Uuid,
  amount: Money,
});

export const ApplyFeePaymentInput = z.object({
  student_id: Uuid,
  account_id: Uuid,
  amount: Money,
  allocations: z.array(PaymentAllocation).optional(),
  attachment_path: z.string().optional(),
  occurred_at: z.string().datetime(),
  idempotency_key: IdempotencyKey,
});
export type ApplyFeePaymentInput = z.infer<typeof ApplyFeePaymentInput>;

export const ApplyFeePaymentOutput = z.object({
  money_event_id: Uuid,
  receipt_no: z.number().int().positive(),
  account_balance_after: Money,
  student_balance_after: Money,
  allocations: z.array(
    z.object({ installment_id: Uuid, running_balance_after: Money }),
  ),
  idempotent_replay: z.boolean().optional(),
});
export type ApplyFeePaymentOutput = z.infer<typeof ApplyFeePaymentOutput>;

// ── record_expense (US4) ─────────────────────────────────────────────────────
export const RecordExpenseInput = z.object({
  account_id: Uuid,
  amount: Money,
  category: z.string().min(1),
  vendor: z.string().optional(),
  description: z.string().optional(),
  attachment_path: z.string().optional(),
  occurred_at: z.string().datetime(),
  idempotency_key: IdempotencyKey,
});
export type RecordExpenseInput = z.infer<typeof RecordExpenseInput>;

export const RecordExpenseOutput = z.object({
  money_event_id: Uuid,
  account_balance_after: Money,
});
export type RecordExpenseOutput = z.infer<typeof RecordExpenseOutput>;

// ── record_transfer (US4) ────────────────────────────────────────────────────
export const RecordTransferInput = z
  .object({
    from_account_id: Uuid,
    to_account_id: Uuid,
    amount: Money,
    description: z.string().optional(),
    occurred_at: z.string().datetime(),
    idempotency_key: IdempotencyKey,
  })
  .refine((v) => v.from_account_id !== v.to_account_id, {
    message: 'يجب اختلاف الحسابين',
    path: ['to_account_id'],
  });
export type RecordTransferInput = z.infer<typeof RecordTransferInput>;

export const RecordTransferOutput = z.object({
  money_event_id: Uuid,
  from_balance_after: Money,
  to_balance_after: Money,
});
export type RecordTransferOutput = z.infer<typeof RecordTransferOutput>;

// ── record_refund (US4) ──────────────────────────────────────────────────────
export const RecordRefundInput = z.object({
  student_id: Uuid,
  account_id: Uuid,
  amount: Money,
  description: z.string().optional(),
  attachment_path: z.string().optional(),
  occurred_at: z.string().datetime(),
  idempotency_key: IdempotencyKey,
});
export type RecordRefundInput = z.infer<typeof RecordRefundInput>;

export const RecordRefundOutput = z.object({
  money_event_id: Uuid,
  account_balance_after: Money,
  student_balance_after: Money,
});
export type RecordRefundOutput = z.infer<typeof RecordRefundOutput>;

// ── record_adjustment (US4) ──────────────────────────────────────────────────
export const RecordAdjustmentInput = z.object({
  student_id: Uuid,
  amount: Money,
  reason: z.string().min(1),
  occurred_at: z.string().datetime(),
  idempotency_key: IdempotencyKey,
});
export type RecordAdjustmentInput = z.infer<typeof RecordAdjustmentInput>;

export const RecordAdjustmentOutput = z.object({
  money_event_id: Uuid,
  student_balance_after: Money,
});
export type RecordAdjustmentOutput = z.infer<typeof RecordAdjustmentOutput>;

// ── apply_discount (US4) ─────────────────────────────────────────────────────
export const DiscountKind = z.enum(['percentage', 'fixed', 'sibling_waiver']);
export type DiscountKind = z.infer<typeof DiscountKind>;

export const ApplyDiscountInput = z.object({
  student_id: Uuid,
  kind: DiscountKind,
  value: Money,
  installment_id: Uuid.optional(),
  reason: z.string().optional(),
  idempotency_key: IdempotencyKey,
});
export type ApplyDiscountInput = z.infer<typeof ApplyDiscountInput>;

export const ApplyDiscountOutput = z.object({
  discount_id: Uuid,
  computed_amount: Money,
  student_balance_after: Money,
});
export type ApplyDiscountOutput = z.infer<typeof ApplyDiscountOutput>;

// ── reverse_event (US4) ──────────────────────────────────────────────────────
export const ReverseEventInput = z.object({
  money_event_id: Uuid,
  reason: z.string().min(1),
  idempotency_key: IdempotencyKey,
});
export type ReverseEventInput = z.infer<typeof ReverseEventInput>;

export const ReverseEventOutput = z.object({
  reversing_event_id: Uuid,
  reverses_event_id: Uuid,
});
export type ReverseEventOutput = z.infer<typeof ReverseEventOutput>;

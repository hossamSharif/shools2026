# Worker Endpoint Contracts — `@erp/api` (Express, Fly.io)

The Express worker is the only long-running process (Article VI). It owns the daily reminder
cron, the SMS dispatch worker, and the provider delivery webhook. All inbound payloads are
validated with **Zod at the boundary** (Article XI). The worker performs **no money math**;
it calls `consume_sms_credit` (RPC) for the atomic send+decrement (Article VII). Dispatch is
**paused** for any school in grace or locked state (FR-043).

Shared primitives:
```ts
const Uuid = z.string().uuid();
const IdempotencyKey = z.string().uuid();
```

---

## 1. Provider delivery webhook (inbound)

`POST /webhooks/sms/delivery` — normalizes provider delivery callbacks into the SMS log's
status field (FR-048; Article VI provider abstraction). Authenticated via a shared secret /
signature header (env-provided; never hard-coded — Security & Secrets).

**Request** (provider-shaped; normalized by the adapter):
```ts
const DeliveryWebhookInput = z.object({
  provider_message_id: z.string().min(1),
  status: z.enum(['accepted', 'delivered', 'failed']),   // normalized from provider vocabulary
  failure_reason: z.string().optional(),
  occurred_at: z.string().datetime().optional(),
});
```
**Behavior**: look up the `sms_message_log` row by `provider_message_id` (tenant-scoped),
map status → `sent | delivered | failed`, persist; a later `failed` is recorded and surfaced
but does **not** auto-refund credit (Assumption "SMS segment counting"; Edge "Provider reports
failure after acceptance").
**Response**:
```ts
const DeliveryWebhookOutput = z.object({ ok: z.boolean(), sms_message_id: Uuid.nullable() });
```
Returns `200` even for unknown ids (idempotent ack) to stop provider retries; logs the miss.

---

## 2. Internal dispatch-trigger endpoint

`POST /internal/dispatch/run` — triggers a school's daily reminder batch (also invoked by the
internal cron). Protected by an internal token (env-provided). (FR-043.)

**Request**:
```ts
const DispatchRunInput = z.object({
  school_id: Uuid,
  as_of_date: z.string().date().optional(),   // defaults to "today" in Africa/Khartoum
  idempotency_key: IdempotencyKey,            // one batch per school per day
});
```
**Behavior**: if the school is in **grace** or **locked**, return `paused` and send nothing.
Otherwise find installments matching active reminder rules (windows computed in
Africa/Khartoum — Article VIII), build the Arabic message per student
(`تذكير: الطالب {الاسم} - {الصف}. قسط مستحق {المبلغ} ج.س بتاريخ {التاريخ}. {المدرسة}`),
compute segments (`@erp/shared`), and for each: skip students with no valid phone (count
them), check credit, send via the configured `SmsProvider`, call `consume_sms_credit`
atomically, write the `sms_message_log` row. On insufficient credit, **stop the batch
cleanly** and report counts (FR-041/045; Article VII).

**Response**:
```ts
const DispatchRunOutput = z.object({
  school_id: Uuid,
  status: z.enum(['completed', 'stopped_insufficient_credit', 'paused']),
  sent: z.number().int(),
  skipped_no_phone: z.number().int(),
  skipped_insufficient_credit: z.number().int(),
  credit_balance_after: z.number().int(),
});
```

---

## 3. Manual reminder endpoint

`POST /internal/dispatch/manual` — admin/accountant sends one reminder on demand to a
student's guardian, subject to the same credit/atomicity/logging rules (FR-046). Gated like
all writes (paused in grace/locked).
```ts
const ManualReminderInput = z.object({
  school_id: Uuid, student_id: Uuid, installment_id: Uuid.optional(),
  idempotency_key: IdempotencyKey,
});
const ManualReminderOutput = z.object({
  status: z.enum(['sent', 'skipped_no_phone', 'skipped_insufficient_credit', 'paused']),
  sms_message_id: Uuid.nullable(), segments: z.number().int().nullable(),
  credit_balance_after: z.number().int(),
});
```

---

## Daily cron (internal, not an HTTP contract)

Runs once per day; for each school in **active** state, computes "today" in Africa/Khartoum
and calls the dispatch-trigger logic above. Paused schools are skipped. (FR-043; Article VIII.)

## `SmsProvider` interface (in `@erp/shared`, referenced here)

```ts
interface SmsProvider {
  send(message: { to: string; body: string }):
    Promise<{ providerMessageId: string; status: 'accepted' | 'failed' }>;
  normalizeWebhook(raw: unknown):
    { providerMessageId: string; status: 'accepted' | 'delivered' | 'failed'; failureReason?: string };
}
```
Exactly one adapter per deployment (env-configured). Phase 1 ships `GenericHttpSmsProvider`
(HTTP POST + webhook normalizer). No provider quirk leaks into business logic (Article VI).

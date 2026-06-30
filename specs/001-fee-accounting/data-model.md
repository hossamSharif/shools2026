# Phase 1 Data Model: School Fee Accounting

Derived from the spec's Key Entities + Functional Requirements and the constitution. All
tenant-scoped tables carry `school_id` with a **default-deny RLS policy** and explicit
`GRANT`s (Article IV new-table checklist). Money is `NUMERIC(14,2)` SDG (Article I).
Timestamps are `timestamptz` UTC, computed/rendered in `Africa/Khartoum` (Article VIII).
Financial rows are **immutable and never deleted**; corrections are reversing entries
(Article III). All schema ships via Supabase MCP `apply_migration`; money-touching
migrations are owner-reviewed first (Article XII).

Legend: 🔒 = tenant-scoped (has `school_id` + RLS) · 💰 = financial/immutable · ⏚ = derived
(no stored balance).

---

## Tenancy, roles, subscription, credit

### School (tenant) 🔒(root)
The isolation boundary. `id`, `name`, `created_at`. Subscription and credit are modeled as
related rows below. Lifecycle state is **derived** from the subscription dates + grace
config (see Subscription).
- FR-002/003. Super-admin manages these; cannot read any school's financial tables.

### User
`id` (Supabase Auth uid), `role` (`super_admin | school_admin | accountant | viewer`),
`school_id` (NULL only for super-admin), `display_name`.
- FR-001/004/005/006. A `user_school` resolution feeds RLS policies. Exactly one school per
  non-super-admin user.

### Subscription 🔒
`school_id`, `period_start` (date), `period_end` (date), `grace_days` (int, default 14).
- Derived **lifecycle state** (no stored editable state):
  `active` while `now ≤ period_end`; `grace` while `period_end < now ≤ period_end + grace_days`;
  `locked` while `now > period_end + grace_days` — all evaluated in `Africa/Khartoum`.
- FR-034/035/036; SC-009. Drives the countdown banner and write-gating.

### SMS Credit Ledger 🔒 💰
- `sms_credit_topup`: `school_id`, `amount` (int segments/credits), `actor_user_id`,
  `created_at`. Super-admin only (FR-037).
- `sms_credit_consumption`: `school_id`, `segments` (int), `sms_message_id`, `created_at`.
- ⏚ **Credit balance** = Σ topups − Σ consumptions. Never stored as editable (FR-037/038).
  Decrement happens atomically with the send via `consume_sms_credit` (Article VII; FR-039/040).

---

## School spine

### Academic Year 🔒
`school_id`, `label` (e.g. `2025/2026`), `is_current` (bool). **Exactly one current** per
school (partial unique index `WHERE is_current`). FR-007; Edge "Current academic year switch".

### Stage (fixed, seeded)
Three fixed: Primary/الابتدائية, Middle/المتوسطة, Secondary/الثانوية. Reference data.
FR-008.

### Grade (fixed, seeded)
12 total under stages (Primary 6 / Middle 3 / Secondary 3), Arabic labels. `stage_id`,
`label_ar`, `ordinal`. Seeded via `@erp/database/seeds`. FR-008.

### Section (شعبة) 🔒
`school_id`, `grade_id`, `name`. Organizes students/reports; **no money effect** (FR-009).

### Student 🔒
`school_id`, `name`, `guardian_name`, `guardian_phone` (nullable/validatable),
`photo_path` (nullable), `status` (`active | withdrawn | graduated`). FR-010.
- Withdrawn/graduated students with a balance still appear on statements/receivables (Edge case).

### Enrollment 🔒
`school_id`, `student_id`, `grade_id`, `section_id`, `academic_year_id`. Ties a student to a
grade+section for a year; supports moving through grades across years. FR-011.
- On insert, triggers generation of the student's installments from the matching fee
  structure (FR-018).

---

## Accounts (derived balances)

### Account 🔒 ⏚
`school_id`, `name`, `type` (`cash | bank`), `account_number` (nullable, bank),
`opening_balance` (`NUMERIC(14,2)`). Multiple cash + any number of bank accounts. FR-012/013.
- ⏚ **Live balance** = `opening_balance` + Σ(money events touching this account). Never
  stored editable (FR-014; SC-004). Every account-touching event references exactly one
  account (FR-015).

---

## Fees, installments, reductions

### Fee Structure 🔒
`school_id`, `grade_id`, `academic_year_id`. Per grade per year. FR-016.
- **Fee Item** (child): `fee_structure_id`, `name` (tuition/transport/books/exam/uniform…),
  `amount` (`NUMERIC(14,2)`). Different amounts per grade allowed.
- **Installment Schedule** (child): `fee_structure_id`, `sequence`, `due_date`, `amount`.
  Flexible installment count, each with its own due date (FR-017).

### Installment / Invoice (student-specific) 🔒 💰
`school_id`, `student_id`, `enrollment_id`, `sequence`, `due_date`, `amount_charged`
(`NUMERIC(14,2)`). Generated from the fee structure on enrollment (FR-018).
- ⏚ **Running balance** per installment = `amount_charged` − Σ allocated payments − Σ
  discounts allocated + Σ refunds allocated. Must **never go negative** (FR-021; Edge
  "Partial then over-payment"). Carries forward for mid-year onboarding via a carried-in
  charge (FR-029).

### Discount / Scholarship / Waiver 🔒 💰
`school_id`, `student_id`, `kind` (`percentage | fixed | sibling_waiver`), `value`,
`computed_amount` (`NUMERIC(14,2)`), `actor_user_id`, `created_at`. Non-cash reduction,
attributable, visible on the statement (FR-019; FR-028). Posted via `apply_discount`.

---

## Money events (canonical, append-only, audited)

### Money Event 🔒 💰 (typed, append-only)
Single family with a typed discriminator `event_type`:
`fee_payment | expense | transfer | refund | adjustment` (discounts tracked separately as
above, per Article III). Common columns:
`id`, `school_id`, `event_type`, `amount` (`NUMERIC(14,2)`), `account_id` (FK; for transfer,
see below), `actor_user_id`, `occurred_at` (timestamptz), `idempotency_key` (unique per
school+operation), `reverses_event_id` (nullable → the event this reverses),
`attachment_path` (nullable, Supabase Storage key), `notes`. FR-020/053; Article I/III/V.

Type-specific fields:
- **fee_payment** (money in): `receipt_no` (per-school gapless int, assigned in-txn),
  allocation to one or more installments (oldest-outstanding first by default). FR-021/022.
  Produces a printable Receipt (FR-023).
- **expense** (money out): `category`, `vendor` (nullable), `description`. Decreases account
  balance (FR-024).
- **transfer** (neutral): `from_account_id`, `to_account_id`; both balances move, counts as
  neither income nor expense (FR-025).
- **refund** (money out to guardian): `student_id`; decreases account, adjusts student
  ledger, not an expense (FR-026).
- **adjustment / write-off**: `student_id`; changes what the student owes, audited (FR-027).

Invariants: posted rows immutable; corrections only via a row with `reverses_event_id`
(both visible); financial rows never deleted (Article III; SC-005). Idempotency key prevents
double-posting on retry/double-click (Article I).

### Receipt 🔒 💰
The printable artifact + `receipt_no` tied to a `fee_payment`. `receipt_no` is per-school,
sequential, gapless, never reused, assigned by `apply_fee_payment` inside the transaction
from `receipt_counter(school_id, next_value)` under row lock (FR-022; SC-003; Edge "Receipt
numbering integrity").

### Audit Entry 🔒 💰
`school_id`, `money_event_id` (or adjustment ref), `actor_user_id`, `action`,
`created_at`. Written inside each money function. Immutable (Article V; FR-053).

---

## Reminders & SMS

### Reminder Rule 🔒
`school_id`, `offset_kind` (`before | on | after`), `days` (int; 0 for `on`), `enabled`
(bool). Defaults seeded: 3 days before, on due date, 3 days after (FR-042). Any combination,
each enable/disable/changeable.

### SMS Message Log 🔒 💰
`school_id`, `student_id`, `recipient_phone`, `message_text` (Arabic), `segments` (int),
`status` (`queued | sent | delivered | failed`), `provider_message_id` (nullable),
`is_manual` (bool), `idempotency_key`, `created_at`, `updated_at`. Viewable per school and
per student (FR-049). Status updated from provider webhook (FR-048); credit consumed on
acceptance, failure recorded but not auto-refunded (Assumption "SMS segment counting").

---

## Notifications

### Notification 🔒
`school_id`, `user_id` (target), `type` (`payment_recorded | low_sms_credit |
subscription_expiring`), `payload`, `read_at` (nullable), `created_at`. In-app only — no
external delivery in this phase (FR-050).

---

## Derived-balance & reconciliation summary (Article II / SC-004)

| Derived value | Formula |
|---|---|
| Account live balance | `opening_balance` + Σ(events touching account) |
| Student balance | Σ charges − Σ discounts/waivers − Σ payments − Σ write-offs + Σ refunds |
| Installment running balance | `amount_charged` − allocated payments − allocated discounts + allocated refunds (≥ 0) |
| SMS credit balance | Σ topups − Σ consumptions (≥ 0) |
| Subscription state | f(`period_end`, `grace_days`, now in Africa/Khartoum) |

No derived value is stored as an editable figure; each must reconcile exactly to its event
sum (reconciliation test, Article X).

## Key indexes (Phase 1 scale)

- `money_event (school_id, account_id, occurred_at)` — account balance & dashboard.
- `money_event (school_id, event_type, occurred_at)` — collected/expenses KPIs.
- `installment (school_id, student_id)` and `installment (school_id, due_date)` — statement &
  receivables aging.
- `sms_message_log (school_id, student_id, created_at)` — per-student SMS view.
- Partial unique `academic_year (school_id) WHERE is_current`.
- Unique `money_event (school_id, idempotency_key)`; unique `fee_payment (school_id, receipt_no)`.

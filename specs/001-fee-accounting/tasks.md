---
description: "Task list for School Fee Accounting (System of Record)"
---

# Tasks: School Fee Accounting (System of Record)

**Input**: Design documents from `/specs/001-fee-accounting/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: INCLUDED — mandated by Constitution Article X ("The Gauntlet"), the plan's Testing
section (Vitest for money functions; Playwright for all E2E/RTL/visual), and quickstart G1–G6.
Money features are not "done" without G1 reconciliation + (payments) G2 concurrency + G3 E2E
green on a real Supabase instance.

**Organization**: Tasks are grouped by user story (P1 → P3) so each story is independently
implementable and testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1–US9 (setup/foundational/polish carry no story label)
- Exact file paths are included in every task

## Path Conventions (from plan.md — multi-package `@erp/*` monorepo)

- `packages/shared/` → `@erp/shared` (domain types, Zod, money-event types, SmsProvider)
- `packages/database/` → `@erp/database` (migrations, money functions, RLS, seeds, gen types)
- `packages/ui/` → `@erp/ui` (RTL-aware shared components)
- `packages/web/` → `@erp/web` (Next.js 14 App Router — UI, reads, light CRUD, RPC calls)
- `packages/api/` → `@erp/api` (Express worker — cron, SMS dispatch, webhook)

> **Article XII**: every migration is applied via Supabase MCP `apply_migration`; migrations
> touching money tables/functions/the receipt counter/RLS are **flagged for owner review**
> before apply. **Article XIII**: every E2E/RTL/visual check is Playwright only.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Monorepo skeleton, tooling, and per-package scaffolds.

- [X] T001 Create pnpm + Turborepo root: `package.json` (workspace root), `pnpm-workspace.yaml` (globs `packages/*`), `turbo.json` (build/lint/test/typecheck pipeline) at repository root
- [X] T002 [P] Add root TypeScript strict config `tsconfig.base.json` (strict mode, `noUncheckedIndexedAccess`) at repository root
- [X] T003 [P] Configure ESLint + Prettier at repository root (`.eslintrc.cjs`, `.prettierrc`, `.editorconfig`)
- [X] T004 [P] Scaffold `@erp/shared` in `packages/shared/` (`package.json`, `tsconfig.json`, `src/{money,sms,schemas}/index.ts`)
- [X] T005 [P] Scaffold `@erp/database` in `packages/database/` (`package.json`, `tsconfig.json`, `migrations/`, `functions/`, `seeds/`, `src/types/`)
- [X] T006 [P] Scaffold `@erp/ui` in `packages/ui/` (`package.json`, `tsconfig.json`, Tailwind + tailwind-merge + cva, `src/index.ts`)
- [X] T007 Scaffold `@erp/web` Next.js 14 App Router in `packages/web/` (`package.json` with next-intl, TanStack Query/Table/Virtual, react-hook-form, Zod, Radix, `@react-pdf/renderer`, Serwist; `next.config.mjs`, `app/`, `lib/`, `pdf/`, `tests/`)
- [X] T008 Scaffold `@erp/api` Express worker in `packages/api/` (`package.json` with express, helmet, cors, express-rate-limit; `src/{cron,dispatch,providers,routes,tests}/`)
- [X] T009 [P] Add Vitest config + scripts to `packages/shared`, `packages/database`, `packages/api` (`vitest.config.ts` each)
- [X] T010 [P] Add Playwright config in `packages/web/playwright.config.ts` (RTL/Arabic locale defaults, single browser project)
- [X] T011 [P] Add `.env.example` at repository root documenting all quickstart env vars (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SMS_PROVIDER`, `SMS_PROVIDER_BASE_URL`, `SMS_PROVIDER_API_KEY`, `SMS_WEBHOOK_SECRET`, `DISPATCH_INTERNAL_TOKEN`, `SCHOOL_TZ=Africa/Khartoum`)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Cross-cutting infrastructure every user story depends on — auth, tenant-isolation
conventions, shared types/Zod, money-event definitions, i18n/RTL shell, base UI, write-gating
helper, and the type-generation pipeline.

**⚠️ CRITICAL**: No user story work begins until this phase is complete.

### Shared domain types & Zod (single source of truth — Article XI)

- [X] T012 [P] Define Zod primitives `Money` (`/^\d{1,12}(\.\d{1,2})?$/`), `Uuid`, `IdempotencyKey` in `packages/shared/src/schemas/primitives.ts`
- [X] T013 [P] Define the canonical money-event discriminator + type set (`fee_payment | expense | transfer | refund | adjustment`) and per-type field types in `packages/shared/src/money/events.ts`
- [X] T014 [P] Define `SmsProvider` interface (`send`, `normalizeWebhook`) in `packages/shared/src/sms/provider.ts`
- [X] T015 [P] Implement Arabic-Unicode SMS segment-count util (~70 chars/segment) in `packages/shared/src/sms/segments.ts`
- [X] T016 [P] Unit test the segment-count util (single/multi-segment Arabic) in `packages/shared/src/sms/segments.test.ts`

### Database foundation (Supabase MCP — Article XII)

- [X] T017 Document the migration workflow + money-migration owner-review gate in `packages/database/README.md`, and add the reusable default-deny RLS + GRANT policy template in `packages/database/migrations/_templates/tenant_rls.sql`
- [X] T018 Migration: create `user` table (`id` Auth uid, `role` enum `super_admin|school_admin|accountant|viewer`, `school_id` nullable, `display_name`) + `user_school` resolution and the `current_school_id()` / `current_role()` SQL helpers reading the JWT, via Supabase MCP `apply_migration` (file `packages/database/migrations/0001_users_and_resolution.sql`)
- [X] T019 Migration: seed reference data — three fixed Stages (الابتدائية/المتوسطة/الثانوية) and 12 Grades (Primary 6 / Middle 3 / Secondary 3, Arabic labels, `ordinal`) in `packages/database/seeds/stages_grades.sql`
- [X] T020 Migration: `subscription_state(school_id)` SQL helper deriving `active|grace|locked` from `period_end` + `grace_days` evaluated in `Africa/Khartoum`, and a `assert_writes_allowed(school_id)` guard raising `WRITES_GATED`/`DISPATCH_PAUSED`, in `packages/database/functions/write_gating.sql` (money-migration → owner review)
- [X] T021 Generate TypeScript types via Supabase MCP `generate_typescript_types` into `packages/database/src/types/database.ts` (consumed by other packages; no hand-written DB types)

### Auth, RLS plumbing & web shell

- [X] T022 Implement Supabase SSR clients (server, client, middleware) in `packages/web/lib/supabase/{server,client,middleware}.ts` with session-based auth and `school_id` claim propagation
- [X] T023 Implement role-aware auth guard + middleware in `packages/web/middleware.ts` and `packages/web/lib/auth/guard.ts` (redirect unauthenticated; expose role + school)
- [X] T024 Implement the Zod-validated RPC caller wrapper (validates input before RPC, output on return, maps DB error codes) in `packages/web/lib/rpc/call.ts`
- [X] T025 [P] Configure next-intl Arabic locale + `dir="rtl"` root layout in `packages/web/app/layout.tsx` and `packages/web/i18n/{request.ts,messages/ar.json}`
- [X] T026 [P] Implement RTL formatting utils — Arabic numerals, `Africa/Khartoum` dates (date-fns tz), SDG currency — in `packages/web/lib/format/{number,date,currency}.ts`
- [X] T027 [P] Build base RTL-aware `@erp/ui` components (Button, Input, Select, Dialog, Card, DataTable wrapper over TanStack Table) in `packages/ui/src/components/`
- [X] T028 Implement TanStack Query provider + app shell/navigation (role-scoped nav) in `packages/web/app/providers.tsx` and `packages/web/components/app-shell.tsx`
- [X] T029 [P] Add Vitest test for `subscription_state` derivation (active/grace/locked boundaries in Africa/Khartoum) in `packages/database/src/functions/write_gating.test.ts`

**Checkpoint**: Foundation ready — auth, RLS conventions, shared types, RTL shell, and base UI exist. User stories can now begin.

---

## Phase 3: User Story 1 - Super-admin onboards a school tenant (Priority: P1) 🎯 MVP

**Goal**: A super-admin creates a school tenant, sets its annual subscription window, and adds
SMS credit — while being walled off from every school's financial data.

**Independent Test**: Create a school with name + subscription window, add SMS credit, confirm
it appears in the operator list with correct dates + credit balance, and confirm the operator
cannot open the school's ledger/money events.

### Tests for User Story 1 ⚠️

- [X] T030 [P] [US1] Playwright E2E: super-admin creates school, sets subscription, adds credit; school appears with correct dates + zero→topped-up balance, in `packages/web/tests/us1-onboard-school.spec.ts`
- [X] T031 [P] [US1] Playwright + MCP isolation test (G5): super-admin attempting to read a school's `money_event`/financial tables returns zero rows, in `packages/web/tests/us1-superadmin-isolation.spec.ts`
- [X] T032 [P] [US1] Vitest: `topup_sms_credit` adds credit, logs actor/when, and credit balance = Σtopups; super-admin-only enforced, in `packages/database/src/functions/topup_sms_credit.test.ts`

### Implementation for User Story 1

- [X] T033 [US1] Migration: `school` (id, name, created_at) + `subscription` (school_id, period_start, period_end, grace_days default 14) tables with default-deny RLS + GRANTs, in `packages/database/migrations/0002_school_subscription.sql` (money-adjacent → owner review)
- [X] T034 [US1] Migration: `sms_credit_topup` (school_id, amount int, actor_user_id, created_at) + `sms_credit_consumption` (school_id, segments, sms_message_id, created_at) tables with RLS (super-admin GRANT on topup; financial tables excluded from super-admin reads), in `packages/database/migrations/0003_sms_credit_ledger.sql` (money-migration → owner review)
- [X] T035 [US1] Migration: super-admin RLS policies that **exclude** super-admin from all financial tables (`money_event`, `installment`, `sms_credit_consumption`, etc.) in `packages/database/migrations/0004_superadmin_financial_walloff.sql` (money-migration → owner review)
- [X] T036 [US1] Implement `topup_sms_credit(school_id, amount, idempotency_key)` Postgres function (super-admin only; logs topup; returns `credit_balance_after`) in `packages/database/functions/topup_sms_credit.sql` (money-migration → owner review)
- [X] T037 [US1] Add Zod schemas `CreateSchoolInput`, `SetSubscriptionInput`, `TopupSmsCreditInput/Output` in `packages/shared/src/schemas/admin.ts`
- [X] T038 [P] [US1] Super-admin schools list page (table of schools, subscription dates, derived credit balance) in `packages/web/app/(super-admin)/schools/page.tsx`
- [X] T039 [P] [US1] Create-school + set-subscription form (react-hook-form + Zod) in `packages/web/app/(super-admin)/schools/new/page.tsx` and `packages/web/components/super-admin/school-form.tsx`
- [X] T040 [US1] Add-SMS-credit action calling `topup_sms_credit` RPC in `packages/web/app/(super-admin)/schools/[schoolId]/credit/page.tsx`
- [X] T041 [US1] Server actions / light CRUD for school + subscription create/update in `packages/web/lib/actions/schools.ts`

**Checkpoint**: A super-admin can onboard a tenant with subscription + credit and is provably walled off from financials. MVP-onboarding works end to end.

---

## Phase 4: User Story 2 - School admin builds the school spine and enrolls students (Priority: P1)

**Goal**: Academic years (one current), the fixed stages/grades, sections, cash/bank accounts
with opening balances, per-grade per-year fee structures with installments, and enrollment
that generates a student's installments.

**Independent Test**: Set up a current year, grades/sections, ≥1 cash + 1 bank account with
opening balances, a fee structure with installments; enroll a student; confirm installments
generate with correct amounts + due dates.

### Tests for User Story 2 ⚠️

- [X] T042 [P] [US2] Playwright E2E: build year → sections → accounts → fee structure → enroll student → installments generated correctly, in `packages/web/tests/us2-spine-and-enroll.spec.ts`
- [X] T043 [P] [US2] Vitest: exactly-one-current-year invariant (partial unique index) enforced, in `packages/database/src/migrations/academic_year.test.ts`
- [X] T044 [P] [US2] Vitest: enrollment generates installments matching the fee structure; enrollment with no fee structure generates none (Edge case), in `packages/database/src/functions/generate_installments.test.ts`

### Implementation for User Story 2

- [X] T045 [US2] Migration: `academic_year` (school_id, label, is_current) with partial unique index `WHERE is_current`, RLS + GRANTs, in `packages/database/migrations/0005_academic_year.sql`
- [X] T046 [US2] Migration: `section` (school_id, grade_id, name) and `student` (school_id, name, guardian_name, guardian_phone nullable, photo_path nullable, status `active|withdrawn|graduated`) with RLS + GRANTs, in `packages/database/migrations/0006_sections_students.sql`
- [X] T047 [US2] Migration: `enrollment` (school_id, student_id, grade_id, section_id, academic_year_id) with RLS + GRANTs, in `packages/database/migrations/0007_enrollment.sql`
- [X] T048 [US2] Migration: `account` (school_id, name, type `cash|bank`, account_number nullable, opening_balance NUMERIC(14,2)) with RLS + GRANTs, in `packages/database/migrations/0008_accounts.sql` (money-adjacent → owner review)
- [X] T049 [US2] Migration: `fee_structure` (school_id, grade_id, academic_year_id) + child `fee_item` (name, amount) + `installment_schedule` (sequence, due_date, amount) with RLS + GRANTs, in `packages/database/migrations/0009_fee_structure.sql` (money-adjacent → owner review)
- [X] T050 [US2] Migration: `installment` (school_id, student_id, enrollment_id, sequence, due_date, amount_charged NUMERIC(14,2)) — immutable financial row — with RLS + GRANTs and indexes `(school_id, student_id)`, `(school_id, due_date)`, in `packages/database/migrations/0010_installments.sql` (money-migration → owner review)
- [X] T051 [US2] Implement `generate_installments(enrollment_id)` Postgres function/trigger that creates a student's installments from the matching fee structure on enrollment (FR-018; no-op when no structure — Edge case), in `packages/database/functions/generate_installments.sql` (money-migration → owner review)
- [X] T052 [US2] Implement `record_opening_balance` handling + carried-in outstanding charge for mid-year onboarding (FR-029) in `packages/database/functions/opening_balances.sql` (money-migration → owner review)
- [X] T053 [P] [US2] Zod schemas for year/section/student/account/fee-structure/enrollment forms in `packages/shared/src/schemas/spine.ts`
- [X] T054 [P] [US2] Academic-year management UI (create, mark current) in `packages/web/app/(school)/settings/years/page.tsx`
- [X] T055 [P] [US2] Grades (read-only fixed) + sections management UI in `packages/web/app/(school)/settings/grades/page.tsx`
- [X] T056 [P] [US2] Accounts management UI (cash/bank, opening balance) in `packages/web/app/(school)/settings/accounts/page.tsx`
- [X] T057 [P] [US2] Fee-structure builder UI (fee items + installment schedule with due dates) in `packages/web/app/(school)/settings/fees/page.tsx`
- [X] T058 [P] [US2] Student profile CRUD UI in `packages/web/app/(school)/students/page.tsx` and `packages/web/components/students/student-form.tsx`
- [X] T059 [US2] Enrollment UI (student → grade+section+year) that triggers installment generation, in `packages/web/app/(school)/students/[studentId]/enroll/page.tsx`
- [X] T060 [US2] Server actions / light CRUD for spine entities in `packages/web/lib/actions/spine.ts`

**Checkpoint**: A school admin can stand up the full spine and enroll a student with correctly generated installments.

---

## Phase 5: User Story 3 - Accountant records a fee payment with a receipt (Priority: P1)

**Goal**: Record a (partial) payment to a named account, optional attachment, with a
gapless per-school receipt number and a printable RTL Arabic receipt; balances derive from
the posted event only.

**Independent Test**: For a student with an outstanding installment + an account, record a
partial payment with an attached image; confirm a sequential receipt number, a printable
receipt, and both student + account balances change by exactly the payment amount.

**Depends on**: US1 (school/subscription/credit), US2 (students/accounts/installments).

### Tests for User Story 3 ⚠️

- [X] T061 [P] [US3] Playwright E2E (G3.1): partial payment → receipt number issued → balances update → receipt renders RTL Arabic (SC-006), in `packages/web/tests/us3-fee-payment.spec.ts`
- [X] T062 [P] [US3] Vitest concurrency test (G2/SC-003): parallel `apply_fee_payment` for one school yields gapless, unique, never-reused `receipt_no`; a rolled-back payment consumes no number, in `packages/database/src/functions/apply_fee_payment.concurrency.test.ts`
- [X] T063 [P] [US3] Vitest (G1/SC-004): reconciliation — account + student + installment running balance equal the event-sum after a payment; overpayment is blocked (running balance never negative), in `packages/database/src/functions/apply_fee_payment.test.ts`
- [X] T064 [P] [US3] Vitest: idempotency — replaying the same `idempotency_key` returns the prior result, no double-post, in `packages/database/src/functions/apply_fee_payment.idempotency.test.ts`

### Implementation for User Story 3

- [X] T065 [US3] Migration: `money_event` table (typed discriminator, amount NUMERIC(14,2), account_id, actor_user_id, occurred_at timestamptz, idempotency_key, reverses_event_id, attachment_path, notes) — immutable, never deleted — with RLS, GRANTs, unique `(school_id, idempotency_key)`, and indexes `(school_id, account_id, occurred_at)` / `(school_id, event_type, occurred_at)`, in `packages/database/migrations/0011_money_event.sql` (money-migration → owner review)
- [X] T066 [US3] Migration: `receipt_counter` (school_id, next_value) + `audit_entry` (school_id, money_event_id, actor_user_id, action, created_at) immutable tables with RLS + GRANTs, in `packages/database/migrations/0012_receipt_counter_audit.sql` (money-migration → owner review)
- [X] T067 [US3] Migration: `payment_allocation` (money_event_id, installment_id, amount) linking a payment to installment(s), with RLS + GRANTs, in `packages/database/migrations/0013_payment_allocation.sql` (money-migration → owner review)
- [X] T068 [US3] Implement `apply_fee_payment(...)` single-transaction Postgres function: oldest-outstanding-first default allocation, block overpayment (`OVERPAYMENT_BLOCKED`), lock `receipt_counter` `FOR UPDATE` to assign gapless `receipt_no`, write `money_event` + `payment_allocation` + `audit_entry`, enforce `assert_writes_allowed` (`WRITES_GATED`), honor `idempotency_key` (`IDEMPOTENT_REPLAY`), in `packages/database/functions/apply_fee_payment.sql` (money-migration → owner review)
- [X] T069 [US3] Create `money-attachments` private Storage bucket + tenant RLS policy keyed to first path segment = `school_id` (per storage-contract), via Supabase MCP, recorded in `packages/database/migrations/0014_storage_money_attachments.sql` (owner review)
- [X] T070 [P] [US3] Add `ApplyFeePaymentInput/Output` Zod schemas (amounts as decimal strings) in `packages/shared/src/schemas/money.ts`
- [X] T071 [US3] Implement attachment upload (MIME + ~5 MB validation at boundary; path `{school_id}/{event_type}/{yyyy}/{mm}/{id}-{n}.{ext}`) in `packages/web/lib/storage/attachments.ts`
- [X] T072 [US3] Implement derived-balance read queries/views (account live balance, student balance, installment running balance) in `packages/database/functions/derived_balances.sql` and `packages/web/lib/queries/balances.ts`
- [X] T073 [US3] Fee-payment UI: select student/installment(s) + account, amount, optional attachment, submit via `apply_fee_payment` RPC, in `packages/web/app/(school)/payments/new/page.tsx` and `packages/web/components/payments/payment-form.tsx`
- [X] T074 [US3] Printable RTL Arabic receipt PDF template (student, grade/section, amount, account, date, receipt #, running balance) using `@react-pdf/renderer` in `packages/web/pdf/receipt.tsx`, with print route `packages/web/app/(school)/payments/[eventId]/receipt/page.tsx`

**Checkpoint**: Core money-in works — gapless receipts, derived balances reconcile, RTL receipt prints. This is the headline Phase-1 capability (MVP-complete with US1+US2+US3).

---

## Phase 6: User Story 4 - Record the full set of money events (Priority: P2)

**Goal**: Expenses, inter-account transfers, refunds, write-offs/adjustments, plus
discounts/scholarships/waivers — completing the canonical event set, with reversing-entry
corrections.

**Independent Test**: Record one expense, one transfer, one refund, one write-off; confirm each
touches the correct account(s), is audited, and reflects in derived balances; apply a discount
and confirm amount owed drops with no cash movement.

### Tests for User Story 4 ⚠️

- [X] T075 [P] [US4] Playwright E2E (G3.2): expense / transfer / refund / adjustment each post and balances reconcile (G1), in `packages/web/tests/us4-money-events.spec.ts`
- [X] T076 [P] [US4] Vitest reconciliation for expense/transfer/refund/adjustment + discount (cash-neutral) in `packages/database/src/functions/money_events.test.ts`
- [X] T077 [P] [US4] Vitest: reversing entry leaves original + reversal both visible and audited; no UPDATE/DELETE of posted rows (SC-005), in `packages/database/src/functions/reverse_event.test.ts`

### Implementation for User Story 4

- [X] T078 [US4] Migration: `discount` (school_id, student_id, kind `percentage|fixed|sibling_waiver`, value, computed_amount NUMERIC(14,2), actor_user_id, created_at) immutable table with RLS + GRANTs, in `packages/database/migrations/0015_discounts.sql` (money-migration → owner review)
- [X] T079 [US4] Migration: transfer columns/handling on `money_event` (`from_account_id`, `to_account_id`) and refund/adjustment `student_id` linkage, in `packages/database/migrations/0016_money_event_typefields.sql` (money-migration → owner review)
- [X] T080 [P] [US4] Implement `record_expense(...)` Postgres function (account out, category/vendor/description, audit, write-gating, idempotency) in `packages/database/functions/record_expense.sql` (money-migration → owner review)
- [X] T081 [P] [US4] Implement `record_transfer(...)` (from≠to, both balances move, neither income nor expense) in `packages/database/functions/record_transfer.sql` (money-migration → owner review)
- [X] T082 [P] [US4] Implement `record_refund(...)` (account out to guardian, adjusts student ledger, not an expense) in `packages/database/functions/record_refund.sql` (money-migration → owner review)
- [X] T083 [P] [US4] Implement `record_adjustment(...)` (write-off changing student owed, audited) in `packages/database/functions/record_adjustment.sql` (money-migration → owner review)
- [X] T084 [P] [US4] Implement `apply_discount(...)` (percentage/fixed/sibling waiver → computed_amount, no cash, audited, visible on statement) in `packages/database/functions/apply_discount.sql` (money-migration → owner review)
- [X] T085 [US4] Implement `reverse_event(money_event_id, reason, idempotency_key)` generic reverser (posts row with `reverses_event_id`; both remain visible) in `packages/database/functions/reverse_event.sql` (money-migration → owner review)
- [X] T086 [P] [US4] Add Zod schemas `RecordExpenseInput/Output`, `RecordTransferInput/Output`, `RecordRefundInput/Output`, `RecordAdjustmentInput/Output`, `ApplyDiscountInput/Output`, `ReverseEventInput/Output` in `packages/shared/src/schemas/money.ts`
- [X] T087 [P] [US4] Expense entry UI (account, category, vendor, description, attachment) in `packages/web/app/(school)/expenses/new/page.tsx`
- [X] T088 [P] [US4] Transfer UI (from/to accounts, amount) in `packages/web/app/(school)/transfers/new/page.tsx`
- [X] T089 [P] [US4] Refund UI (student, account, amount, attachment) in `packages/web/app/(school)/refunds/new/page.tsx`
- [X] T090 [P] [US4] Adjustment/write-off UI (student, amount, reason) in `packages/web/app/(school)/adjustments/new/page.tsx`
- [X] T091 [P] [US4] Discount/scholarship/waiver UI (student, kind, value, target installment) in `packages/web/app/(school)/students/[studentId]/discount/page.tsx`
- [X] T092 [US4] Reverse-entry action + UI affordance on a posted money event in `packages/web/components/money/reverse-event-button.tsx` and `packages/web/lib/actions/money-events.ts`

**Checkpoint**: The full canonical event set is recordable; corrections are reversing-entry only; all balances reconcile.

---

## Phase 7: User Story 5 - Student statement and receivables aging report (Priority: P2)

**Goal**: Printable/exportable student statement (running balance + total owed) and the
receivables aging report (current / 1–30 / 31–60 / 61–90 / 90+), filterable by stage/grade/section.

**Independent Test**: For a student with charges, a discount, partial payments — generate the
statement (correct running balance/total owed, exports); generate the receivables report,
confirm correct buckets, filter by grade, confirm bucket totals + export.

### Tests for User Story 5 ⚠️

- [X] T093 [P] [US5] Playwright E2E (G4): student statement renders RTL Arabic, running balance + total owed correct, exports PDF, in `packages/web/tests/us5-statement.spec.ts`
- [X] T094 [P] [US5] Playwright E2E: receivables report buckets are correct, grade/stage/section filters change list + bucket totals, exports tabular, in `packages/web/tests/us5-receivables.spec.ts`
- [X] T095 [P] [US5] Vitest: aging-bucket assignment in Africa/Khartoum (boundaries 0/30/60/90), withdrawn/graduated students with a balance still appear (Edge case), in `packages/database/src/functions/receivables.test.ts`

### Implementation for User Story 5

- [X] T096 [US5] Implement statement query (ordered charges/discounts/payments/refunds with running balance + total owed) in `packages/database/functions/student_statement.sql` and `packages/web/lib/queries/statement.ts`
- [X] T097 [US5] Implement receivables aging query (unpaid students bucketed, filterable by stage/grade/section, per-bucket totals; windows in Africa/Khartoum) in `packages/database/functions/receivables_aging.sql` and `packages/web/lib/queries/receivables.ts`
- [X] T098 [P] [US5] Student statement page (TanStack Table, RTL) in `packages/web/app/(school)/students/[studentId]/statement/page.tsx`
- [X] T099 [P] [US5] Statement PDF template (RTL Arabic, SDG) in `packages/web/pdf/statement.tsx` with export route `packages/web/app/(school)/students/[studentId]/statement/pdf/route.ts`
- [X] T100 [P] [US5] Receivables report page with filters + per-bucket totals (TanStack Table/Virtual) in `packages/web/app/(school)/reports/receivables/page.tsx`
- [X] T101 [US5] Tabular export (CSV/PDF) of the receivables report in `packages/web/lib/export/receivables-export.ts`

**Checkpoint**: A bursar can produce a correct student statement and the receivables aging report, both exportable.

---

## Phase 8: User Story 6 - School admin dashboard (Priority: P2)

**Goal**: Per-account balances + combined total, collected (month/year), outstanding
receivables, collection rate, monthly expenses, net cash flow, overdue-student count, SMS
credit remaining, and a pinned subscription countdown banner — all derived.

**Independent Test**: With accounts/charges/payments/expenses present, open the dashboard and
confirm each account balance, combined total, KPIs, SMS credit, and countdown are correct.

### Tests for User Story 6 ⚠️

- [X] T102 [P] [US6] Playwright E2E (G1): dashboard KPIs match event-sum derived figures; account balances + combined total correct, in `packages/web/tests/us6-dashboard.spec.ts`
- [X] T103 [P] [US6] Vitest: collection rate, net cash flow, overdue count aggregates correct in Africa/Khartoum month/year windows, in `packages/database/src/functions/dashboard_kpis.test.ts`

### Implementation for User Story 6

- [X] T104 [US6] Implement dashboard KPI query bundle (per-account + combined balance, collected month/year, outstanding, collection rate, monthly expenses, net cash flow, overdue count, derived SMS credit) in `packages/database/functions/dashboard_kpis.sql` and `packages/web/lib/queries/dashboard.ts`
- [X] T105 [P] [US6] Dashboard page laying out account cards + KPI tiles (RTL, ≤3 s budget) in `packages/web/app/(school)/dashboard/page.tsx`
- [X] T106 [P] [US6] Pinned subscription countdown banner (days remaining + lifecycle state) component in `packages/ui/src/components/subscription-banner.tsx` mounted in the school app shell
- [X] T107 [P] [US6] SMS-credit-remaining + low-credit indicator tile in `packages/web/components/dashboard/credit-tile.tsx`

**Checkpoint**: The admin sees a correct, fully derived operating picture with the subscription countdown.

---

## Phase 9: User Story 7 - Reminder rules and SMS dispatch to guardians (Priority: P2)

**Goal**: Configurable reminder rules (before/on/after, defaults provided), a daily dispatch
that builds the Arabic message, checks credit, sends, logs, and decrements credit by segment
count atomically; manual reminders; full per-school/per-student SMS log; paused in grace/locked.

**Independent Test**: Configure rules, run daily dispatch against matching installments,
confirm Arabic SMS sent, credit decrements by segment count, no-phone/insufficient-credit
students skipped + counted, batch stops cleanly, every message logged with status; then send
one manual reminder with the same behavior.

### Tests for User Story 7 ⚠️

- [ ] T108 [P] [US7] Vitest (G6/SC-011): batch depleting credit mid-run — `consume_sms_credit` never goes negative, never double-charges, stops cleanly with sent-vs-skipped counts, in `packages/api/src/tests/dispatch-credit-integrity.test.ts`
- [ ] T109 [P] [US7] Vitest: dispatch skips + counts students with no valid phone; paused school (grace/locked) sends nothing, in `packages/api/src/tests/dispatch-rules.test.ts`
- [ ] T110 [P] [US7] Vitest: delivery webhook maps provider status → `sent|delivered|failed`; a later `failed` records but does not auto-refund credit, in `packages/api/src/tests/delivery-webhook.test.ts`
- [ ] T111 [P] [US7] Playwright E2E: configure reminder rules, view SMS log per school + per student with status, in `packages/web/tests/us7-reminders.spec.ts`

### Implementation for User Story 7

- [ ] T112 [US7] Migration: `reminder_rule` (school_id, offset_kind `before|on|after`, days int, enabled) with RLS + GRANTs, and seed defaults (3 before / on / 3 after), in `packages/database/migrations/0017_reminder_rules.sql`
- [ ] T113 [US7] Migration: `sms_message_log` (school_id, student_id, recipient_phone, message_text, segments, status `queued|sent|delivered|failed`, provider_message_id nullable, is_manual, idempotency_key, created_at, updated_at) with RLS + GRANTs and index `(school_id, student_id, created_at)`, in `packages/database/migrations/0018_sms_message_log.sql` (money-adjacent → owner review)
- [ ] T114 [US7] Implement `consume_sms_credit(school_id, sms_message_id, segments, idempotency_key)` atomic decrement (never negative, `INSUFFICIENT_CREDIT`, `DISPATCH_PAUSED`, `IDEMPOTENT_REPLAY`) in `packages/database/functions/consume_sms_credit.sql` (money-migration → owner review)
- [ ] T115 [P] [US7] Implement `GenericHttpSmsProvider` adapter (HTTP POST send + webhook normalizer) implementing `SmsProvider` in `packages/api/src/providers/generic-http.ts`
- [ ] T116 [US7] Implement dispatch worker: find installments matching active rules (windows in Africa/Khartoum), build Arabic message (`تذكير: الطالب {الاسم} - {الصف}. قسط مستحق {المبلغ} ج.س بتاريخ {التاريخ}. {المدرسة}`), compute segments, skip no-phone (count), check credit, send, `consume_sms_credit`, write log row, stop cleanly on insufficient credit, in `packages/api/src/dispatch/run-dispatch.ts`
- [ ] T117 [US7] Implement `POST /internal/dispatch/run` endpoint (token-protected, Zod `DispatchRunInput/Output`, returns paused/completed/stopped + counts) in `packages/api/src/routes/dispatch-run.ts`
- [ ] T118 [US7] Implement `POST /internal/dispatch/manual` endpoint (Zod `ManualReminderInput/Output`, same credit/atomicity/logging, gated) in `packages/api/src/routes/dispatch-manual.ts`
- [ ] T119 [US7] Implement `POST /webhooks/sms/delivery` endpoint (secret-verified, Zod `DeliveryWebhookInput/Output`, status normalize → persist, idempotent 200) in `packages/api/src/routes/delivery-webhook.ts`
- [ ] T120 [US7] Implement daily cron scheduler (per-school Africa/Khartoum day; skip paused schools) in `packages/api/src/cron/daily-reminders.ts`
- [ ] T121 [P] [US7] Reminder-rules config UI (enable/disable/change before/on/after, defaults) in `packages/web/app/(school)/settings/reminders/page.tsx`
- [ ] T122 [P] [US7] SMS log views — per school and per student (recipient, text, segments/credit, status, timestamp) in `packages/web/app/(school)/sms/page.tsx` and `packages/web/app/(school)/students/[studentId]/sms/page.tsx`
- [ ] T123 [P] [US7] Manual-reminder send button (calls worker endpoint) in `packages/web/components/sms/manual-reminder-button.tsx`
- [ ] T124 [US7] Low-credit / insufficient-credit admin alert surfacing (FR-041) in `packages/web/lib/notifications/credit-alert.ts`

**Checkpoint**: Daily + manual Arabic reminders send with atomic segment-count billing, full logging, and clean batch-stop on credit exhaustion.

---

## Phase 10: User Story 8 - Subscription lifecycle enforcement (Priority: P3)

**Goal**: On expiry → grace (read-only: view/export, no new money events/edits) → locked
(view/export only). DB is the authority for write-gating.

**Independent Test**: Move a school past its end date → confirm read-only in grace (view/export
allowed, money events blocked); move past grace → confirm full lock except view/export.

### Tests for User Story 8 ⚠️

- [X] T125 [P] [US8] Vitest: every money RPC rejects with `WRITES_GATED` in grace/locked; reads/exports still succeed (SC-009), in `packages/database/src/functions/write_gating_enforcement.test.ts`
- [X] T126 [P] [US8] Playwright E2E (G3.4): grace → read-only UI; locked → view/export-only; new money events blocked 100%, in `packages/web/tests/us8-lifecycle.spec.ts`

### Implementation for User Story 8

- [X] T127 [US8] Wire `assert_writes_allowed` into every money/credit RPC (verify `apply_fee_payment`, `record_*`, `apply_discount`, `consume_sms_credit`, `reverse_event` all gate) — migration touch-up in `packages/database/migrations/0019_enforce_write_gating.sql` (money-migration → owner review)
- [X] T128 [P] [US8] UI write-gating: hide/disable all mutate actions in grace/locked, keep view/export, in `packages/web/lib/auth/lifecycle-gate.ts` and `packages/web/components/lifecycle-banner.tsx`
- [X] T129 [P] [US8] Reflect lifecycle state + remaining days in the pinned countdown banner (extend US6 banner) in `packages/ui/src/components/subscription-banner.tsx`

**Checkpoint**: Lifecycle state machine enforces read-only/locked at the DB authority and in the UI.

---

## Phase 11: User Story 9 - In-app notification center (Priority: P3)

**Goal**: A bell that surfaces payment-recorded, low-SMS-credit, and subscription-expiring-soon
notifications to the relevant user — no external delivery.

**Independent Test**: Trigger a payment, drive credit low, approach expiry; confirm each
surfaces in-app to the relevant user with no external message sent.

### Tests for User Story 9 ⚠️

- [X] T130 [P] [US9] Playwright E2E: payment → "payment recorded" notification; low credit → low-credit notification; near expiry → expiring-soon notification; no SMS/push sent, in `packages/web/tests/us9-notifications.spec.ts`

### Implementation for User Story 9

- [X] T131 [US9] Migration: `notification` (school_id, user_id, type `payment_recorded|low_sms_credit|subscription_expiring`, payload, read_at nullable, created_at) with RLS + GRANTs, in `packages/database/migrations/0020_notifications.sql`
- [X] T132 [US9] Emit notifications: payment-recorded (from `apply_fee_payment` path), low-credit (from `consume_sms_credit`/threshold), expiring-soon (from cron/lifecycle) in `packages/database/functions/emit_notifications.sql` and `packages/api/src/cron/expiry-notifications.ts`
- [X] T133 [P] [US9] Notification center bell UI (list, unread, mark-read) in `packages/web/components/notifications/bell.tsx` and `packages/web/app/(school)/notifications/page.tsx`

**Checkpoint**: The notification center surfaces the three event types in-app with no external delivery.

---

## Phase 12: Polish & Cross-Cutting Concerns

**Purpose**: Whole-system hardening, performance, PWA, and the full Gauntlet pass.

- [ ] T134 [P] Add Serwist manifest + service worker for installable-only PWA (no offline data layer) in `packages/web/app/manifest.ts` and `packages/web/app/sw.ts`
- [ ] T135 [P] Verify performance budgets (dashboard, receivables, statement ≤3 s; PDF export ≤5 s) at ~2,000 students; add/adjust indexes if measured slow (Article II), recorded in `packages/database/migrations/0021_performance_indexes.sql`
- [ ] T136 Run full Gauntlet (G1–G6) against a real Supabase instance per `quickstart.md`; record results in `specs/001-fee-accounting/gauntlet-results.md`
- [ ] T137 [P] Tenant-isolation security sweep (SC-012): cross-school read/write attempts as each role + super-admin against financial tables, in `packages/web/tests/security-tenant-isolation.spec.ts`
- [ ] T138 [P] RTL/Arabic + SDG audit across all screens and printed docs (SC-013) in `packages/web/tests/rtl-arabic-audit.spec.ts`
- [ ] T139 [P] Regenerate TypeScript types via Supabase MCP after final migrations into `packages/database/src/types/database.ts`
- [ ] T140 [P] Worker hardening: helmet, CORS, rate-limit, token/secret verification review in `packages/api/src/app.ts`
- [ ] T141 Run `quickstart.md` end-to-end validation and confirm Definition of Done (every tenant table has `school_id` + RLS + GRANTs; money features have G1 + G2 + G3 green)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies — start immediately.
- **Foundational (Phase 2)**: depends on Setup — **blocks all user stories**.
- **User Stories (Phases 3–11)**: all depend on Foundational. Priority order P1 → P2 → P3.
- **Polish (Phase 12)**: depends on all targeted stories.

### User Story Dependencies

- **US1 (P1)**: after Foundational. No dependency on other stories.
- **US2 (P1)**: after Foundational. Independent of US1 (different tables), though both are the P1 spine.
- **US3 (P1)**: after Foundational; **needs US1** (school/subscription/credit + write-gating) and **US2** (students/accounts/installments) data to be exercisable end to end.
- **US4 (P2)**: after Foundational; reuses US3's `money_event`/audit infra.
- **US5 (P2)**: after Foundational; consumes charges/payments/discounts from US2–US4.
- **US6 (P2)**: after Foundational; derives from US2–US4 data and US1 subscription/credit.
- **US7 (P2)**: after Foundational; needs US2 installments/guardian phones and US1 credit.
- **US8 (P3)**: after Foundational; enforces gating across US3/US4/US7 RPCs.
- **US9 (P3)**: after Foundational; depends on events produced by US3/US7/US8.

### Within Each User Story

- Tests written first and FAIL before implementation (Constitution Article X).
- Migrations/tables → Postgres money functions → Zod schemas → server actions/RPC callers → UI.
- Money migrations (money tables/functions/receipt counter/RLS) are owner-reviewed before `apply_migration` (Article XII).

### Parallel Opportunities

- All `[P]` Setup tasks (T002–T006, T009–T011) run together.
- Most Foundational `[P]` tasks (T012–T016, T025–T027, T029) run together once their package scaffold exists.
- After Foundational, the P1 stories' table migrations can proceed; once US1+US2 land, US3 completes the P1 MVP.
- Within US4, the five money functions (T080–T084) and their UIs (T087–T091) are all `[P]`.
- All per-story test tasks marked `[P]` run together at the start of their phase.

---

## Parallel Example: User Story 4

```bash
# Money functions (different files, no interdependency):
Task: "record_expense  in packages/database/functions/record_expense.sql"
Task: "record_transfer in packages/database/functions/record_transfer.sql"
Task: "record_refund   in packages/database/functions/record_refund.sql"
Task: "record_adjustment in packages/database/functions/record_adjustment.sql"
Task: "apply_discount  in packages/database/functions/apply_discount.sql"

# Their entry UIs (different routes):
Task: "Expense UI    in packages/web/app/(school)/expenses/new/page.tsx"
Task: "Transfer UI   in packages/web/app/(school)/transfers/new/page.tsx"
Task: "Refund UI     in packages/web/app/(school)/refunds/new/page.tsx"
Task: "Adjustment UI in packages/web/app/(school)/adjustments/new/page.tsx"
```

---

## Implementation Strategy

### MVP First (P1 stories)

1. Phase 1 Setup → Phase 2 Foundational (CRITICAL — blocks everything).
2. US1 (onboard tenant) → US2 (spine + enrollment) → US3 (fee payment + receipt).
3. **STOP and VALIDATE**: run G1 reconciliation + G2 receipt concurrency + G3.1 E2E on real Supabase.
4. This P1 slice is the demonstrable system-of-record MVP.

### Incremental Delivery

1. Setup + Foundational → foundation ready.
2. US1 → US2 → US3 → **MVP demo** (money-in with gapless receipts + derived balances).
3. US4 (full event set) → US5 (statement + receivables) → US6 (dashboard) → US7 (reminders) → demo each.
4. US8 (lifecycle) → US9 (notifications) → final Gauntlet (Phase 12).

### Parallel Team Strategy

After Foundational: one developer drives the P1 spine (US1→US2→US3) to MVP while the DB/money
functions are owner-reviewed; once US3's `money_event` infra lands, US4–US7 can be split across
developers (each story is independently testable), with US8/US9 last.

---

## Notes

- `[P]` = different files, no dependency on an incomplete task.
- `[Story]` label maps each task to its user story for traceability.
- Every money/credit migration is **owner-reviewed before `apply_migration`** (Article XII).
- All E2E/RTL/visual checks are **Playwright only** (Article XIII); money functions are unit/integration-tested with **Vitest** (Article X).
- No tenant table is "done" without `school_id` + RLS + GRANTs; no money feature is "done" without G1 + (payments) G2 + relevant G3 green on real Supabase (quickstart Definition of Done).
- Commit per completed task on `001-fee-accounting`; halt and raise if a commit cannot be made (plan Git discipline).

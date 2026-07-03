# The Gauntlet — Results (T136 / T141, re-run with seeded data)

Run date: 2026-07-03 (follow-up session). Supabase project: `schools`
(`euumbaotyarjtcvwamax`, ACTIVE_HEALTHY, eu-central-1, Postgres 17).

## What changed since the previous run

The previous run (see history below) could not exercise G1/G2/G3/G5 because there was no
seeded multi-role/multi-school test data and no service-role credential. This session:

1. Seeded real test data directly via Supabase MCP `execute_sql` (test data, not schema —
   committed at `packages/database/seeds/test_gauntlet_data.sql`):
   - 2 schools ("Gauntlet School A" / "Gauntlet School B") with active subscriptions.
   - 5 auth users (`auth.users` + `auth.identities`, password `password123` via
     `pgcrypto`/`crypt`) + matching `public.user` rows: `super_admin` (school-less),
     School A's `school_admin` / `accountant` / `viewer`, School B's `school_admin`.
   - School A spine: 1 academic year, 2 sections, 2 accounts (cash `50,000` SDG opening +
     bank `200,000` SDG opening), a fee structure (grade `p1`, 2 fee items, 3-installment
     schedule), 12 students + enrollments — **installments generated via the real
     `generate_installments()` trigger/RPC**, not hand-inserted (36 rows for 12 students ×
     3 installments, verified by count).
   - 6 real money events posted via the actual Postgres RPCs (`apply_fee_payment` ×2,
     `record_expense`, `record_transfer`, `record_refund`, `apply_discount`, plus an SMS
     credit `topup_sms_credit` + a manual `sms_message_log`/`sms_credit_consumption` row).
2. To call the `SECURITY DEFINER` money RPCs meaningfully as a specific tenant user from
   raw SQL (which otherwise runs as the `postgres` role with `auth.uid()` null), sessions
   were impersonated with `SELECT set_config('request.jwt.claims', '{"sub":"<uid>",
   "role":"authenticated"}', true); SET LOCAL role authenticated;` inside an explicit
   `BEGIN…COMMIT`, matching exactly how `auth.uid()` is implemented in this project
   (confirmed by reading `pg_proc.prosrc` for `auth.uid()` before using this approach).
3. Ran the **real** Playwright specs that were already fully written (not skeletons) against
   the live project with the seeded users as real env vars — see G3/G5 below.
4. Found and fixed one real bug in a test spec (not app code) — see "Bug found & fixed".

## G1 — Reconciliation: **PASS** (live, evidence below)

Two independent computations — event-sum (raw `money_event`/`payment_allocation`/
`discount` rows, summed by hand) vs. derived (the project's own `account_balance()` /
`student_balance()` / `installment_running_balance()` SQL functions) — were compared for
all three levels the constitution requires. All matched **exactly**, to the SDG cent.

**Account balance** (opening + Σevents):

| account | opening | event-sum | derived (`account_balance()`) |
|---|---|---|---|
| الخزينة الرئيسية (cash) | 50,000.00 | 45,500.00 | 45,500.00 |
| حساب بنكي (bank) | 200,000.00 | 207,666.67 | 207,666.67 |

**Student balance** (charges − discounts − paid + refunds):

| student | charged | discount | paid | refunded | event-sum | derived (`student_balance()`) |
|---|---|---|---|---|---|---|
| student 01 | 9,500.00 | 0 | 2,000.00 | 0 | 7,500.00 | 7,500.00 |
| student 02 | 9,500.00 | 0 | 3,166.67 | 500.00 | 6,833.33 | 6,833.33 |
| student 03 | 9,500.00 | 300.00 | 0 | 0 | 9,200.00 | 9,200.00 |

**Installment running balance** (student 01, 3 installments):

| seq | charged | event-sum | derived (`installment_running_balance()`) |
|---|---|---|---|
| 1 | 3,166.67 | 1,166.67 | 1,166.67 |
| 2 | 3,166.67 | 3,166.67 | 3,166.67 |
| 3 | 3,166.66 | 3,166.66 | 3,166.66 |

All three reconciliation levels: **zero drift**.

## G2 — Receipt concurrency: **partially verified; true parallel test still blocked (environment limitation)**

- The Vitest suite `apply_fee_payment.concurrency.test.ts` requires `SUPABASE_SERVICE_ROLE_KEY`
  (via `getServiceClient()`/`createAuthedUser()` in `test-helpers/supabase.ts`). Supabase MCP
  intentionally does not expose this secret (only `get_publishable_keys` — anon/publishable —
  is retrievable). Ran `pnpm --filter @erp/database test` with `SUPABASE_URL`/`SUPABASE_ANON_KEY`
  set (no service key): **12 files / 38 tests still skip** (`INTEGRATION_ENV_READY` false).
  This is a genuine environment limitation, not a code gap — confirmed by re-running in this
  session.
- What **was** verified live: the two sequential `apply_fee_payment` calls made while seeding
  (for students 01 and 02) were issued `receipt_no` **1** and **2** respectively — gapless,
  unique — and `receipt_counter.next_value` is now `3`, consistent with exactly 2 receipts
  issued. This confirms the counter mechanism functions correctly under real transactions, but
  it is **sequential evidence, not a substitute for the true parallel-load assertion** the
  Vitest suite performs (N simultaneous `Promise.all` calls). The parallel-load property
  remains unverified in this environment.

## G3 — Money-critical E2E paths: **partially PASS (live Playwright), rest environment-blocked**

Two Playwright specs in `packages/web/tests/` were already fully implemented (no `TODO`
skeletons, pure Supabase-client assertions, no UI navigation) rather than skip-scaffolded —
these were run for real, live, against the seeded project:

- `us1-superadmin-isolation.spec.ts` — **1/1 passed** (super-admin reads zero rows from
  `sms_credit_consumption`, a financial table, even with real consumption data seeded).
- `security-tenant-isolation.spec.ts` (T137) — **7/7 passed** after a bug fix (see below):
  school_admin/accountant/viewer for School A each (a) read zero rows cross-school from 7
  financial tables when querying School B's `school_id`, and (b) have `apply_fee_payment`
  rejected when targeting School B; super-admin reads zero rows across all 7 financial
  tables.

The remaining G3 specs (`us3-fee-payment.spec.ts`, `us4-money-events.spec.ts`,
`us7-reminders.spec.ts`, `us8-lifecycle.spec.ts`, `rtl-arabic-audit.spec.ts`) are **UI-navigation
skeletons** — they contain `test.skip(...)` with `// TODO` bodies (e.g. "goto /students/:id/pay",
"enter amount, choose account, submit") rather than working selectors against the real app UI.
Writing real selectors for these from scratch without having interactively driven the actual
rendered pages risks fabricating tests that assert the wrong thing, so they were **not**
un-skipped this session — doing so honestly requires either (a) interactively exploring the
running app first to get real selectors, or (b) the original feature author finishing them.
This is a **pre-existing code/spec-authoring gap**, not purely an environment limitation:
Playwright itself works fine here (Chromium is installed at
`~/AppData/Local/ms-playwright`, `npx playwright test` runs), so a running `next dev` + these
two proven-runnable specs prove the mechanism end-to-end; the gap is that 5 of 7 specs are
unfinished skeletons.

Backend logic for the skeleton specs' underlying flows (`apply_fee_payment`, `record_expense`,
`record_transfer`, `record_refund`, `apply_discount`) **was** independently verified via direct
SQL/RPC calls in this session (see G1 evidence + the money-event table dump: `fee_payment` ×2,
`expense` ×1, `transfer` ×1, `refund` ×1 all posted correctly with correct account/student
linkage) — so "backend logic verified via SQL RPC calls; full UI E2E for these 5 specs remains
unwritten, not merely unrun."

## Bug found & fixed (test spec, not app code)

`packages/web/tests/security-tenant-isolation.spec.ts` called `.select('id')` uniformly across
7 financial tables, but `public.receipt_counter`'s primary key is `school_id` — it has **no**
`id` column at all (confirmed via `list_tables`). Running the spec live surfaced a real
Postgres error (`42703: column receipt_counter.id does not exist`) that would have made this
test permanently fail once un-skipped, regardless of RLS correctness. Fixed by changing both
occurrences to `.select('*')` (the assertions only check row *count*, not specific columns).
Committed separately from the seed-data commit as a test-only fix.

## G4 — RTL/Arabic assertions: unchanged from previous run (static, partial)

Left as previously assessed: static grep across `packages/web/app/**/*.tsx` found zero
hardcoded non-Arabic literals; root layout sets `dir="rtl"`/`lang="ar"`. The live
`rtl-arabic-audit.spec.ts` still requires a running `next dev` server and its 4 tests
navigate real pages (`/dashboard`, receipt/statement links, `/reports/receivables`) that
were not driven interactively this session — not re-attempted for the same "unfinished
skeleton" reason as above, layered on the added requirement of a running dev server.

## G5 — Tenant isolation: **PASS (live, both SQL-direct and Playwright)**

Verified twice, independently:

1. **Direct SQL**, impersonating each seeded user via `request.jwt.claims` + `SET LOCAL role
   authenticated` (the mechanism `quickstart.md`/the constitution implies, and the only way
   to exercise per-role RLS from a raw connection that would otherwise run as `postgres`):
   - School A `school_admin` reading School B's `student` rows: **0 rows** (RLS blocked the
     read entirely).
   - School A `school_admin` attempting `apply_fee_payment` against a School-B student (found
     via a cross-school subquery that itself returned nothing under RLS): **rejected**
     (`STUDENT_NOT_FOUND`, because the underlying read was already walled off by RLS).
   - Super-admin reading `account`, `installment`, `student`, `receipt_counter` directly:
     **0 rows on every table** (no super-admin policy exists on financial/tenant tables).
2. **Live Playwright** (`us1-superadmin-isolation.spec.ts` + `security-tenant-isolation.spec.ts`,
   8 tests total): **8/8 passed** — see G3 section above for the breakdown.

This supersedes the previous run's "partially verified (structural)" status — G5 is now
directly, behaviorally verified end-to-end.

## G6 — SMS credit integrity: unchanged from previous run (unit-verified)

`packages/api/src/tests/dispatch-credit-integrity.test.ts` — 2/2 passed live (pure-logic,
no live DB dependency). The DB-level `consume_sms_credit` Postgres-function integration test
remains unverified for the same `SUPABASE_SERVICE_ROLE_KEY` gap as G2. A real `topup_sms_credit`
RPC call was exercised this session (100 credits topped up for School A, balance confirmed via
its own return value: `credit_balance_after: 100`) and one manual `sms_message_log` +
`sms_credit_consumption` row was inserted to give the isolation tests real data to walk over,
but the atomic send+decrement path itself (`consume_sms_credit`) was not additionally exercised
this session.

## Summary table

| Gauntlet check | Status | Evidence |
|---|---|---|
| G1 — Reconciliation | **PASS** | Live SQL, 3 levels, zero drift (tables above) |
| G2 — Receipt concurrency | **Partial** | Sequential gapless receipts (1,2) confirmed live; true N-parallel Vitest suite still blocked — needs `SUPABASE_SERVICE_ROLE_KEY` (environment limitation) |
| G3 — Money-critical E2E | **Partial PASS** | 2/7 specs fully implemented and passing live (8 tests); remaining 5 are unfinished UI skeletons (code/spec gap, not environment) — their backend RPCs independently SQL-verified |
| G4 — RTL/Arabic | **Partial (static)** | Unchanged from prior run; live spec needs a driven dev server session |
| G5 — Tenant isolation | **PASS** | Live SQL impersonation + live Playwright, 8/8 tests passing |
| G6 — SMS credit integrity | **Unit-verified** | Unchanged; `topup_sms_credit` RPC exercised live this session |

## Honest remaining gaps

1. **G2 true parallel test**: needs `SUPABASE_SERVICE_ROLE_KEY` as a real env var (never
   retrievable via MCP by design) to unlock `pnpm --filter @erp/database test` — 38 tests
   including the concurrency suite.
2. **G3 remaining 5 specs**: need to be *written* (not just un-skipped) against the real
   rendered app UI — requires an operator or a session that interactively drives `next dev`
   with a browser to discover real selectors, then fills in the `TODO`s.
3. **G4 live spec**: same as above, needs a driven dev-server session with seeded
   receipt/statement data to click through.

## Previous run's findings (superseded above, kept for history)

<details>
<summary>Original run (2026-07-03, no seeded data)</summary>

This environment initially had no seeded test users, no `.env` file, and no
`SUPABASE_SERVICE_ROLE_KEY`. All 24 migrations (0001–0024) were applied; all functions from
Phases 3–11 present. Definition-of-Done structural checks (T141) were confirmed live via
Supabase MCP: every tenant table has `school_id` (21 tables), RLS enabled + ≥1 policy +
explicit GRANTs on every table (24 tables), `get_advisors` showed only expected
`SECURITY DEFINER` WARNs and minor performance INFO/WARNs. `pnpm --filter @erp/shared test`
(6/6), `pnpm --filter @erp/api test` (10/10), `pnpm -w typecheck` (green) all passed;
`pnpm --filter @erp/database test` reported 38 tests skipped (env gap). G1–G3/G5 were
"unverified this session" for lack of seeded data + service-role secret; G4 was "partially
verified (static)"; G6 was "unit-verified" only. This full run is now superseded by the
seeded-data verification above.

</details>

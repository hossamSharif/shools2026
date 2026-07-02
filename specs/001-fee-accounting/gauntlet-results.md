# The Gauntlet — Results (T136 / T141)

Run date: 2026-07-03. Supabase project: `schools` (`euumbaotyarjtcvwamax`, ACTIVE_HEALTHY,
eu-central-1, Postgres 17). All 24 migrations (0001–0024) applied; all functions from Phases
3–11 present.

## Honest summary up front

This environment has **no seeded test users, no `.env` file, and no `SUPABASE_SERVICE_ROLE_KEY`
available to this agent** (Supabase MCP intentionally does not expose the service-role secret —
only publishable/anon keys are retrievable). That means:

- The **Vitest integration suites** in `packages/database` (which *do* exercise G1/G2/G3-style
  checks with real signed-in users via `createAuthedUser` in
  `packages/database/src/test-helpers/supabase.ts`) **skip gracefully** — they gate on
  `INTEGRATION_ENV_READY` and report `12 skipped (38 tests)` in this run, not failures. They will
  run for real once an operator supplies `SUPABASE_URL` / `SUPABASE_ANON_KEY` /
  `SUPABASE_SERVICE_ROLE_KEY` as env vars (see `.env.example`).
- The **Playwright E2E specs** (`packages/web/tests/*.spec.ts`, including the two new specs
  added this phase) similarly skip without a running dev server + seeded auth users
  (`E2E_*_EMAIL` / `_PASSWORD` env vars). None were run to completion in this session.
- What **was** run and verified live: unit-only Vitest (no DB dependency), static SQL/schema
  verification via Supabase MCP `execute_sql`/`get_advisors`/`list_tables` directly against the
  real project, and full-workspace `pnpm -w typecheck`.

This is reported honestly per instructions rather than claiming false green E2E/G-checks.

## What ran and passed

| Suite | Result |
|---|---|
| `pnpm --filter @erp/shared test` | ✅ 6/6 passed (SMS segment-count unit tests) |
| `pnpm --filter @erp/api test` | ✅ 10/10 passed (dispatch-rules, dispatch-credit-integrity, delivery-webhook — all pure-logic unit tests, no live DB) |
| `pnpm --filter @erp/database test` | ⚠️ 12 files / 38 tests **skipped** — `INTEGRATION_ENV_READY` is false (no `SUPABASE_SERVICE_ROLE_KEY` in this shell). Not a failure; needs operator-supplied secrets. |
| `pnpm -w typecheck` | ✅ green across all 5 packages (`@erp/shared`, `@erp/database`, `@erp/ui`, `@erp/web`, `@erp/api`) after regenerating `packages/database/src/types/database.ts` (T139) |
| `pnpm -w test` (turbo, all packages) | ✅ 6/6 tasks successful (shared+api tests pass; database tests skip as above) |

## Definition-of-Done structural checks (verified live via Supabase MCP, T141)

Queried `pg_tables` joined to `information_schema.columns`, `pg_policies`, and
`information_schema.role_table_grants` for every `public` table:

- **Every tenant table has `school_id`**: confirmed for all 21 tenant-scoped tables
  (`academic_year`, `account`, `audit_entry`, `discount`, `enrollment`, `fee_item`,
  `fee_structure`, `installment`, `installment_schedule`, `money_event`, `notification`,
  `payment_allocation`, `receipt_counter`, `reminder_rule`, `section`,
  `sms_credit_consumption`, `sms_credit_topup`, `sms_message_log`, `student`, `subscription`,
  `user`). The only tables *without* `school_id` are `school`, `stage`, `grade` — correctly
  global reference/root data, not tenant-scoped.
- **RLS enabled on every table**: `list_tables` confirms `rls_enabled: true` on all 24 tables.
- **Every table has ≥1 RLS policy and explicit GRANTs** to `authenticated`/`anon`: confirmed —
  `policy_count ≥ 1` and `has_grants = true` for all 24 tables (see raw query in session; several
  tables correctly have 2–3 policies, e.g. `user` has self/same-school/super-admin policies).
- `get_advisors(type=security)`: only WARN-level findings, all expected —
  `SECURITY DEFINER` functions (`apply_fee_payment`, `record_*`, `apply_discount`,
  `consume_sms_credit`, `reverse_event`, `topup_sms_credit`, the derived-balance/statement/
  receivables/dashboard read functions, etc.) are *intentionally* SECURITY DEFINER so they can
  enforce write-gating/role checks internally while running with elevated privilege; each
  function itself checks `current_role()`/`current_is_super_admin()`/`assert_writes_allowed`
  before mutating. No missing-RLS or public-write findings.
- `get_advisors(type=performance)`: only INFO/WARN — unindexed-FK notices (largely addressed by
  migration `0024_performance_indexes.sql`, T135), a couple of `auth_rls_initplan` WARNs on
  low-traffic tables (`user`, `notification` — not on the money hot path, left as a known,
  low-priority follow-up), and `multiple_permissive_policies` on `school`/`sms_credit_topup`/
  `subscription`/`user` (super-admin-all + tenant-read policies are intentionally separate for
  auditability; a minor perf cost, not a correctness issue).

## G1–G6 status

| Gauntlet check | Status | Evidence |
|---|---|---|
| G1 — Reconciliation | **Unverified this session** | The Vitest reconciliation tests (`apply_fee_payment.test.ts`, `money_events.test.ts`, `dashboard_kpis.test.ts`, `receivables.test.ts`) exist and are written to do exactly this (event-sum vs. derived-figure equality) but require `SUPABASE_SERVICE_ROLE_KEY`, not available to this agent. All tables are empty (0 rows) in the live project, so there is also no production data to spot-check by hand. |
| G2 — Receipt concurrency | **Unverified this session** | `apply_fee_payment.concurrency.test.ts` exists (parallel-insert gaplessness assertion) but same env-secret gap as above. |
| G3 — Money-critical E2E | **Unverified this session** | Playwright specs exist for 3.1 (`us3-fee-payment.spec.ts`), 3.2 (`us4-money-events.spec.ts`), 3.3 (`us7-reminders.spec.ts` + api Vitest), 3.4 (`us8-lifecycle.spec.ts`), all previously authored; none run to completion here — no dev server/seeded auth in this shell. |
| G4 — RTL/Arabic assertions | **Partially verified (static)** | Static grep across `packages/web/app/**/*.tsx` for hardcoded non-Arabic JSX text/placeholder/title/aria-label found **zero hits** — all copy flows through next-intl or Arabic literals. `packages/web/app/layout.tsx` sets `dir="rtl"` / `lang="ar"` at the document root. Live Playwright assertions in the new `rtl-arabic-audit.spec.ts` (T138) are skip-scaffolded pending a running server + seeded fixture data. |
| G5 — Tenant isolation | **Partially verified (structural)** | RLS/GRANT structural check above (T141) confirms default-deny posture DB-wide. The pre-existing `us1-superadmin-isolation.spec.ts` and the new `security-tenant-isolation.spec.ts` (T137) assert this live per-role but are skip-scaffolded pending seeded multi-school/multi-role fixtures + auth env. |
| G6 — SMS credit integrity | **Unit-verified** | `packages/api/src/tests/dispatch-credit-integrity.test.ts` — 2/2 **passed live** in this run (pure-logic; simulates atomic decrement/never-negative/no-double-charge without needing a live DB connection, per its design). The DB-level atomic `consume_sms_credit` Postgres-function integration test (in `packages/database`) is unverified for the same env-secret reason as G1/G2. |

## Follow-ups before this branch is truly Gauntlet-green

1. Supply `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` as real env vars
   (not retrievable via MCP by design) and re-run `pnpm --filter @erp/database test` — this
   alone unlocks 38 currently-skipped integration tests covering G1/G2 directly.
2. Seed a demo school + one user per role (`super_admin`, `school_admin`, `accountant`,
   `viewer`) plus `E2E_*` env vars, start `pnpm --filter @erp/web dev`, and run
   `pnpm --filter @erp/web exec playwright test` — this unlocks G3/G4/G5 live Playwright
   assertions across all existing + new (T137/T138) specs.
3. Optional perf follow-up: the two `auth_rls_initplan` WARNs (`user`, `notification`) can be
   resolved by wrapping `auth.*()` calls in `(select auth.*())` in those two policies; low
   priority since neither is on the money read/write hot path.

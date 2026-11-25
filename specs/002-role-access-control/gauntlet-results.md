# Verification Results: 002-role-access-control

## Hotfix 0032a: pre-check (T008), 2026-11-25

Live project `schools` (`euumbaotyarjtcvwamax`, Postgres 17.6), read-only checks through
Supabase MCP (`list_migrations`, `execute_sql` over `pg_proc`).

**Exposure confirmed on live:**

| Function | SECURITY DEFINER | anon EXECUTE | authenticated EXECUTE | checks caller's school |
|---|---|---|---|---|
| `dashboard_kpis` | yes | **yes** | yes | **no** |
| `student_statement` | yes | **yes** | yes | **no** |
| `receivables_aging` | yes | **yes** | yes | **no** |
| `sms_credit_balance` | yes | **yes** | yes | **no** |
| `consume_sms_credit` | yes | **yes** | **yes** (internal-only) | no (takes `p_school_id`) |
| `account_balance` | yes | no | yes | **no** |
| `student_balance` | yes | no | yes | **no** |
| `installment_running_balance` | yes | no | yes | **no** |
| `check_low_sms_credit` | yes | no | **yes** (internal-only) | no |
| `generate_installments` | yes | no | **yes** (internal-only) | no |
| `mark_notification_read` | no (invoker) | yes | yes | yes |

**Live vs repo:** the live bodies of all seven functions that 0032a replaces are identical to
the repo sources, ignoring comments and whitespace (normalised md5 compared). That includes
the live-only migration `derived_balances_v3_reversal_fix`, whose content is already in
`functions/derived_balances_v2.sql`. 0032a therefore changes no logic; it only adds the guard.
The live ACLs are slightly tighter than the repo source (anon already lacks EXECUTE on the
balance helpers), and the 0032a revokes are harmless either way.

## Hotfix 0032a: local verification (before owner review)

Throwaway local Postgres 16 with stub Supabase `auth`/`storage` schemas and Supabase-like
default privileges. All 53 Phase 1 SQL files were loaded from `git HEAD`, then 0032a was
applied. This does **not** replace the live Gauntlet run (T011).

- Before 0032a: a School A accountant read School B data through all 7 functions; anon
  executed `dashboard_kpis`, `student_statement`, `receivables_aging` and `sms_credit_balance`.
- 0032a applies cleanly in one transaction.
- After 0032a:
  - all 7 cross-school calls raise `FORBIDDEN_SCHOOL`;
  - anon gets `permission denied` on all 4;
  - `authenticated` gets `permission denied` on `consume_sms_credit`, `check_low_sms_credit`
    and `generate_installments`, and `service_role` keeps access;
  - same-school results are byte-identical before and after for all 7;
  - an unknown id still returns NULL;
  - `service_role` still reads any school;
  - `apply_fee_payment` as the accountant works (receipt 1, account 100 → 220, student
    300 → 180), so nested definer calls pass the guard;
  - an accountant enrollment still generates installments through the trigger.

## Hotfix 0032a: live apply (T011), 2026-11-25

- Owner approved the SQL in chat. Applied through Supabase MCP `apply_migration` as
  `0032a_harden_finance_definer_exposure` (recorded version `20261125074628`).
- **Live permissions after apply:** anon has EXECUTE on none of the 12 functions;
  `consume_sms_credit`, `check_low_sms_credit` and `generate_installments` are service_role only;
  all 7 finance functions contain the `assert_target_school` guard.
- **Live behaviour, on real data inside a block that always aborts (nothing persisted),
  acting as a real school user:**
  - same school: `dashboard_kpis` identical to the trusted value, `student_balance` identical,
    `student_statement` the same row count (82);
  - other school: `dashboard_kpis`, `receivables_aging`, `student_statement`,
    `student_balance`, `sms_credit_balance` and `account_balance` all raise `FORBIDDEN_SCHOOL`.
- **Security advisor after apply:**
  - `anon_security_definer_function_executable` now lists only
    `update_own_display_name` (pre-existing; it acts on `auth.uid()`, so it is a no-op for anon).
    Revoking it from anon belongs to the US1 policy-audit work (T032), which flags any
    definer function executable by anon.
  - `authenticated_security_definer_function_executable` (27) is expected: these are the
    RPC API. Each now self-checks the school, and feature 002 adds permission checks and a
    reviewed allow-list. Two low-risk items to handle there: `subscription_state(p_school_id)`
    and `assert_writes_allowed(p_school_id)` reveal any school's lifecycle state.
  - Pre-existing configuration warnings, unrelated to 0032a: `pg_trgm` in `public`; leaked-password
    protection disabled in Auth.
- **Not yet run:** the integration test `definer-exposure.test.ts`, the Phase 1 money Vitest suite
  and `us9-notifications.spec.ts`. They need `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and
  `SUPABASE_ANON_KEY` in this environment. The equivalent behaviour was verified locally
  (above) and on live (this section). T011 stays open until those suites run.

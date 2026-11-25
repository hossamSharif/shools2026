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

## Hotfix 0032a: live apply (T011)

_Pending owner review of the SQL._

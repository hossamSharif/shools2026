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
- **Automated suites against live, 2026-11-25** (keys provided by the owner, used only as
  environment variables):
  - `definer-exposure.test.ts`: **21/21 passed**.
  - Full `@erp/database` Vitest suite (Phase 1 Gauntlet: reconciliation, receipt concurrency,
    idempotency, write gating, aging, KPIs, reversal, top-up, installments): **59/59 passed**
    in 13 files.
  - A direct API probe: an anon `POST /rest/v1/rpc/dashboard_kpis` returns `42501
    permission denied`.
  - `us9-notifications.spec.ts`: **3/4 passed**. Low-credit (`check_low_sms_credit` via the service
    role), expiring-soon and mark-read all pass. The UI payment test fails for a reason
    unrelated to 0032a:
    - the payment posts (receipt 37, 7.00 SDG on the Gauntlet School A), but the web output
      schema rejects `student_balance_after = -866.00`;
    - the hotfixed `student_balance` returns exactly the original expression's value
      (`-866.00` both ways);
    - the negative comes from accumulated Gauntlet data on test student
      `a5000000-…0001` (charged 9,500; payments 2,901; discounts 7,600; 19 adjustments and
      19 refunds from repeated E2E runs, July–August).

    Follow-up (Phase 1, not 002): `student_balance` is not clamped like
    `installment_running_balance`, so discounts can drive it below zero, and the `Money` output
    schema then fails a payment response. Reset the Gauntlet seed, and decide whether discounts
    should be capped at the remaining balance.
- **Test leftovers:** the Phase 1 helper `createAuthedUser.cleanup()` deletes the user before the
  school's money rows, so the delete silently fails and orphan `t-*@example.test` accounts
  remain. The 7 from this run were removed. 10 older ones (2026-07-03 and 2026-07-13) are still
  there, waiting on an owner decision. Follow-up: fix the cleanup order in
  `packages/database/src/test-helpers/supabase.ts`.

**T011 closed.** The hotfix is live, and the Phase 1 database Gauntlet is green.

## Foundation 0033–0037: local verification (before owner review, T012–T017)

Throwaway local Postgres 16 with stub Supabase `auth`/`storage` schemas and Supabase-like
default privileges (tables and functions granted to `anon`/`authenticated` on creation). All
Phase 1 SQL files through 0032a were loaded from the working tree, with 5 pre-existing school
users (2 schools) and the super-admin, and then 0033 → 0037 were applied one transaction each.
This does **not** replace the live apply and checks of T018.

- All five migrations apply cleanly.
- **Backfill (US2-4, FR-018a):** every school user has exactly one assignment equal to
  `user.role`. There are 0 stage rows and no assignment for the super-admin.
- **RLS:** enabled and forced on all 7 new tables. `anon` has no privilege on any of them, and
  `authenticated` has `select` only. Catalogue: 49 keys (28 not yet enforced), 138 default
  grants, 6 optional switches.
- **Helpers, as real `authenticated` sessions:**
  - accountant `my_access()`: `["accountant"]`, school set, 12 keys, staff;
  - super-admin: `["super_admin"]`, no school, 0 keys;
  - teacher + student_affairs: union (`students.write` and `students.read_limited`), no `finance.read`;
  - principal (Primary only): `perm_scope('students.read')` = [Primary], `users.read` school-wide,
    `finance.read` = `{}`;
  - principal: school-wide, `finance.totals` only;
  - principal + viewer: `finance.read` and the viewer's default-on `finance.export`, no `finance.write`;
  - deactivated user: `current_school_id()` NULL, no keys;
  - guardian: not staff, `portal.linked`;
  - `role_assignment` reads: a teacher sees only their own row; the admin sees School A only.
- **Refusals:** `PORTAL_STAFF_MIX` (both directions), `STAGE_SCOPE_NOT_ALLOWED` (stages on
  teacher), `FORBIDDEN_SCHOOL` (assignment in another school), a check violation for a
  super_admin assignment, an FK violation for `('teacher','finance.read')` in
  `school_role_permission` (SC-009), and `NOT_GRANTABLE` for never-grantable default and
  optional rows and for a portal key on a staff role.
- **Super-admin through `user_superadmin_all`:** changing `role`, `status` or `school_id` gives
  `DIRECT_ROLE_CHANGE_FORBIDDEN`, deleting School B's only admin gives `LAST_ADMIN_PROTECTED`,
  and renaming a user is still allowed.
- **No Phase 1 change:** `user_same_school_select` still returns School A users only to the
  School A admin. `apply_fee_payment` as the accountant gives the same result as the 0032a
  baseline (receipt 1, account 100 → 220, student 300 → 180), and the accountant still reads
  `money_event`. A `service_role` JWT is allow-all and school-wide, and `anon` is refused
  `my_access` and `has_perm`.

**Next: T018 owner review gate.** Not yet applied to the live database.

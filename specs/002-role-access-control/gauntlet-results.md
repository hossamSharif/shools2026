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

## Foundation 0033–0037: live apply (T018), 2026-11-25

- **Owner approval:** the owner approved in chat ("Go with next step"). The migrations were
  applied through Supabase MCP `apply_migration`, in order, as `0033_user_role_values`,
  `0034_role_model`, `0035_permission_catalogue`, `0036_portal_link` and
  `0037_access_helpers`. All five succeeded.
- **Pre-check blocker found and resolved:** 10 `public.user` rows pointed to schools that no
  longer exist, so the 0034 backfill would have failed on the new `role_assignment.school_id`
  foreign key. These were the 10 Phase 1 test leftovers noted under T011 (`t-*@example.test`
  accountants created 2026-07-03 and 2026-07-13, with no `money_event`, `audit_entry`,
  `discount` or `sms_credit_topup` rows). With the owner's approval they were deleted
  (`auth.users`, cascading to `public.user`) before 0034 was applied. Afterwards there were
  8 users, 0 orphans and 0 auth identities without a profile.
- **Checks (`list_tables` and read-only `execute_sql`):**
  - 7/7 school users have exactly one assignment equal to `user.role`;
  - 0 stage rows, 0 super-admin assignments, all users `active`;
  - RLS is enabled and forced on all 7 new tables;
  - `anon` holds no privilege on any of them, and `authenticated` has `select` only;
  - catalogue: 49 keys, 138 defaults, 6 optional switches.
- **Behaviour, as each real user inside a block that always aborts (nothing persisted):**
  - every user's `current_school_id()` equals their school;
  - `my_access().roles` = `[user.role]` (super-admin `["super_admin"]`);
  - key counts: school_admin 44, accountant 12, viewer 8 (the 7 defaults plus the default-on
    `finance.export`), super-admin 0;
  - `money_event` visibility is identical to the trusted count for all 8 users (122 for
    School A's admin, accountant and viewer; 0 for the super-admin);
  - `user` visibility is unchanged from Phase 1: admins see their school's users, accountants
    and viewers see themselves, and the super-admin sees the directory.
- **Security advisor:**
  - no new lint type;
  - `anon_security_definer_function_executable` still lists only `update_own_display_name`
    (pre-existing, T032);
  - `authenticated_security_definer_function_executable` went from 27 to 38, which is the 11
    new helpers meant for authenticated callers (`my_access`, `has_perm`, `perm_scope`,
    `can_read_student`, …). These go on the T032 reviewed allow-list.
- **Performance advisor, new findings on the new tables** (left for T033/T087, which fix
  advisor findings with a follow-up migration):
  - INFO `unindexed_foreign_keys`: `role_assignment.assigned_by`,
    `role_assignment_stage.stage_id`, `school_role_permission (role, permission_key)` and
    `changed_by`, `portal_link.school_id`, `user.deactivated_by`, and `permission_key` on
    `role_permission_default` / `optional_permission`;
  - WARN `multiple_permissive_policies` on `role_assignment`, `role_assignment_stage` and
    `portal_link` (own-row and `users.read` select policies, by design; they can be merged into
    one `OR` policy).
- **T019:** types regenerated through `generate_typescript_types` into
  `packages/database/src/types/database.ts`. `pnpm -w typecheck` passes (8/8).

**T018 and T019 closed.** The foundation is live, and Phase 1 behaviour is unchanged.

## Foundation tests (T022): live verification, 2026-11-25

`packages/database/src/access/foundation.test.ts` is written but skips in this session: there is
no `SUPABASE_URL` or service key, so `INTEGRATION_ENV_READY` is false. Its scenarios were checked
instead on the live database, as real `authenticated` sessions, inside blocks that always abort
(nothing persisted):

- **Refusals:** `PORTAL_STAFF_MIX` in both directions, `STAGE_SCOPE_NOT_ALLOWED` for stages on a
  teacher, and an FK violation (23503) for `('teacher','finance.read')` in
  `school_role_permission`.
- **Primary role:** teacher + student_affairs gets primary role `student_affairs`, and
  `my_access().roles` = `[student_affairs, teacher]`. The union holds: `students.write` and
  `students.read_limited`, no `finance.read`.
- **Stage scope:**
  - principal (Primary): `perm_scope('students.read')` = [Primary], `users.read` school-wide;
  - principal: `students.read` school-wide, `finance.read` = `{}`.
- **Deactivated user:** `current_school_id()` NULL, no keys, status `deactivated`, 0 `money_event` rows.
- **Super-admin through `user_superadmin_all`** (live `authenticated` holds UPDATE/DELETE on
  `public.user`, so the guard trigger is the real protection):
  - a plain request changing `role` or `status` gives `DIRECT_ROLE_CHANGE_FORBIDDEN`;
  - changing `school_id` is refused;
  - deleting a school's only admin gives `LAST_ADMIN_PROTECTED`;
  - renaming a user is still allowed.
- **Defect found:** `trg_role_assignment_sync_primary` (0034) leaves `app.access_sync = 'on'` for
  the rest of the transaction. In a transaction that first writes `role_assignment`, a later
  direct `role` or `status` change is therefore not refused. A plain PostgREST request is not
  exposed, because `authenticated` cannot write `role_assignment`. Fixed forward by
  `0037a_scope_access_sync_flag.sql` (restores the previous value after the trigger's own
  UPDATE).
- **0037a live apply:** the owner approved in chat ("Yes apply"). It was applied through
  Supabase MCP `apply_migration` as `0037a_scope_access_sync_flag`. The failing scenario was
  re-run inside an aborting block, with role assignments written first and then direct changes
  by the super-admin:
  - the flag is empty again after the trigger's update;
  - the `role` and `status` changes now give `DIRECT_ROLE_CHANGE_FORBIDDEN`;
  - the primary-role sync still works on add (teacher → student_affairs) and on remove
    (back to teacher).

  **Fixed.**

## US1 migrations 0038–0041: local verification (before owner review, T028–T032)

Throwaway local Postgres 16 with stub Supabase `auth`/`storage` schemas and Supabase-like default
privileges. The schema was built from the repository (Phase 1 through 0037a), and the
`buildAccessFixture` population was seeded with fixed ids: School A with X (Primary), Y (Middle)
and Z (withdrawn, not enrolled), School B, all 15 fixture users, portal links, an SMS log, the
notifications, and payments through the real `apply_fee_payment`. A SQL prober then queried
every table and read function as each user's own `authenticated` session, and a Node evaluator
graded the results against `ACCESS_EXPECTATIONS` (`@erp/shared/access`). Snapshots of the
database were taken before and after the migrations.

0039's bodies were taken from the live database (`pg_get_functiondef`), not from the repo files.

| Check | Before 0038 | After 0038–0041 |
|---|---|---|
| Read matrix (15 users × 28 tables + 11 read functions + internal functions) | 352 failures | **all met** |
| Write matrix (money RPCs, table writes, top-up, reverse) | 140 of 249 failed (e.g. teacher and viewer post payments, teacher creates students) | **all 249 met** |
| `audit_access_policies()` | 28 `signed_in_only_policy`, 7 `role_column_authz` | **0 violations** |
| Phase 1 parity: adminA, adminA2, accountant, viewer, adminB (every table, full `dashboard_kpis`, directory rows) | baseline | **0 differences** |
| Low-SMS-credit recipients (0040) | admin, admin2, accountant | **the same three** (not viewer, not principal + viewer) |

Two fixes were made while verifying:

- In 0038, `x = any((select f()))` is parsed as a subquery comparison. It is now
  `= any((select f())::uuid[])`, which is still evaluated once per statement.
- In 0041, the audit's own body matched its `current_role()` pattern, so the function now
  excludes itself.

Design additions found necessary while writing the migrations (owner review):

- **Relationship-scoped grants (0038).** Without them, a teacher's `structure.read` would have
  shown every section and year. `role_permission_default` and `optional_permission` get a
  `relationship_scoped` flag, and `perm_scope()` gives such grants no direct scope.
- **`*_unchecked` copies (0039).** `account_balance`, `installment_running_balance`,
  `student_balance`, `sms_credit_balance`, `dashboard_kpis`, `student_directory`,
  `student_financial_summary` and `student_installments` keep their unchanged bodies under
  internal names, executable only by the owner and `service_role`. The masked directory,
  guardian summary and principal totals compute through these, and the exposed names decide
  access. The totals subset is taken from the full computation; it does not re-implement the
  aggregates.
- **0040 recipients** are `finance.write` holders (T031), not `finance.read` (rpc-contracts §E),
  because `finance.read` would newly notify viewers.
- **0041** revokes anon EXECUTE on `update_own_display_name`. The reviewed allow-list is a separate
  `reviewed_definer_functions()` that later migrations extend.

## US1 migrations 0038–0041: live apply (T033/T034), 2026-11-25

- **Owner approval:** the owner approved in chat ("Yes"). Before applying, a pre-check confirmed
  the live bodies of the functions 0039 replaces still hash-matched the captured
  `pg_get_functiondef` versions, and the last migration was still 0037a. Applied through Supabase
  MCP `apply_migration` in order: `0038_rewrite_tenant_policies`,
  `0039_harden_derived_and_money_functions`, `0040_notification_recipients`,
  `0041_policy_audit_function`.
- **0039 transcription check:** the md5 over the bodies (`prosrc`) of all 27 functions on the live
  database equals the local database built from the same file (`1539a27d…`, 27/27).
- **`audit_access_policies()` live:** 0 violations.
- **Behaviour, as real users inside a block that always aborts (nothing persisted):**
  - **Phase 1 parity:** all 8 real users (super-admin, 2 school admins, 4 accountants, viewer) see
    exactly the trusted `money_event` and `student` counts (super-admin: 0 students, 0 money);
  - **accountant:** `dashboard_kpis` is byte-identical to the full computation, and
    `apply_fee_payment` posts (receipt 38, rolled back);
  - **viewer:** `apply_fee_payment` gives `FORBIDDEN_PERMISSION` (Phase 1 gap closed).
- **Temporary new-role users in the real school (same aborting block):**
  - **teacher:** 0 money, 0 students, 0 sections, `student_statement` refused;
  - **principal:** `dashboard_kpis` keys = the totals subset only, 0 money;
  - **student affairs:** 12 directory rows, all finance columns masked, 0 money;
  - **guardian:** 1 student (the linked one), `student_financial_summary` works, `student_statement` refused.
- **Security advisor:**
  - `anon_security_definer_function_executable` is gone (`update_own_display_name` revoked);
  - the 38 authenticated-executable definers are exactly `reviewed_definer_functions()`, and no
    `*_unchecked` function is exposed;
  - no new lint type.
- **Performance advisor:**
  - the three `auth_rls_initplan` warnings are gone (the rewritten policies wrap `auth.uid()`);
  - remaining: INFO unindexed FKs, and WARN `multiple_permissive_policies` on 8 tables. Five of
    these are pre-existing super-admin + tenant pairs; three are own-row + `users.read` pairs from
    0034/0037. Follow-up: merge them into single `OR` policies and add the FK indexes in a small
    reviewed migration (T087).
- **T034:** types regenerated into `packages/database/src/types/database.ts`. `pnpm -w typecheck`
  passes (8/8).
- **Not yet run:** the Phase 1 Vitest money suite (reconciliation, receipt concurrency, idempotency,
  write gating) and T024–T027 against the live database. This session has no Supabase keys
  (`INTEGRATION_ENV_READY` is false). **T033 stays open until those suites run.**

## Performance check (T046, SC-008), local, 2026-11-25

T046 asks for before/after numbers, with "before" taken on a branch without 0038/0039.
Production already has them, and its Gauntlet data holds only 12 students (the "2,000-student
seed" does not exist). The check therefore ran on the two local snapshots from the US1
verification:

- **Schemas:** `before0038` is Phase 1 through 0037a; `after0038` is the same plus 0038–0042.
- **Load:** the same synthetic load was added to both: 2,000 extra students in School A, enrolled
  half in Primary and half in Middle (4,005 trigger-generated installments), and 600 payments
  posted through `apply_fee_payment` as the accountant.
- **Measurement:** 25 timed runs per query after one warm-up, as the accountant's
  `authenticated` session. Local Postgres 16 is not production hardware, so the absolute numbers
  only compare with each other.

| Query (accountant) | p50 before → after (ms) | p95 before → after (ms) | p95 change |
|---|---|---|---|
| `student_directory` (2,004 rows) | 1517.0 → 1321.2 | 1629.9 → 1403.8 | **−14 %** |
| `receivables_aging` | 434.3 → 443.4 | 500.1 → 516.7 | +3 % |
| `dashboard_kpis` (3 extra rounds) | 212–222 → 210–216 | 252–282 → 242–255 | ≤ 0 % (noise) |
| `student_statement` (one student) | 0.4–0.7 → 0.8–1.4 | 1.0–1.6 → 1.5–2.2 | +0.5–1.2 ms |
| payments list (`listPayments` query, 500 rows) | 0.3–0.5 → 0.7–0.8 | 0.3–0.6 → 0.7–0.9 | +0.3–0.5 ms |

- **Init-plan:** `EXPLAIN ANALYZE` of a `money_event` select as the accountant shows the policy
  helpers as two `InitPlan`s with `loops=1`, so they are evaluated once per statement, not per row.
- **Large queries** (directory, aging, dashboard): within the ≤10 % p95 budget. The directory is
  faster, because its per-row balance calls now go to the `*_unchecked` helpers.
- **Sub-millisecond queries** (statement, payments list): they gain a fixed 0.3–1.2 ms, which is
  the per-statement permission lookup (`my_effective_grants`). In relative terms that exceeds
  10 %, but the absolute cost is about one millisecond per request. **Owner decision:** accept it
  as meeting SC-008 ("accountant daily tasks no slower" in practice), or ask for a cached
  per-request grant set later. T046 stays open until then.

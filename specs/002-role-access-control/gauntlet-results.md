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

## 0042 live apply (T037), 2026-11-26

- **Owner approval:** the owner approved in chat ("Approved"). Applied through Supabase MCP
  `apply_migration` as `0042_manual_sms_authorization`.
- **Live checks** (real users, inside a block that always aborts):
  - school_admin and accountant pass for a student of their own school, and get
    `FORBIDDEN_STUDENT` for another school's student;
  - the viewer gets `FORBIDDEN_PERMISSION`;
  - anon cannot execute the function;
  - `audit_access_policies()` returns 0 violations.
- **Types:** regenerated. The temporary cast in `packages/api/src/routes/dispatch-manual.ts` was
  removed. `pnpm -w typecheck` passes (8/8), and the worker tests pass (10/10).
- **Deploy order** for the manual-SMS change: 0042 (done), then the worker, then the web app. A
  worker without the web change would reject the requests (no `x-user-jwt`).

## US3 migrations 0043–0044: local verification (before owner review, T050–T051)

Local copy of the post-0042 schema with the `buildAccessFixture` population, plus `citext` and
`pgcrypto` installed into `extensions` as on Supabase. Both migrations apply cleanly, and
`audit_access_policies()` reports 0 violations, with the 9 new user-management RPCs on the
reviewed list and every `um_*` helper internal. A scenario run, as real `authenticated` sessions
(service role where the contract says so), gave:

- **Invitations:**
  - create works (pending, 7-day default expiry);
  - a duplicate pending invitation, or the email of an existing user, gives `EMAIL_IN_USE`;
  - a portal role gives `PORTAL_STAFF_MIX`, and stages on a teacher give `STAGE_SCOPE_NOT_ALLOWED`;
  - the token is 43 characters, and `authenticated` reading `token_hash` gets 42501;
  - `accept_invitation` is 42501 for `authenticated`. As the service role it creates the
    principal with its Primary stage row; a second use, or a revoked token, gives
    `INVITATION_INVALID`;
  - `expire_invitations()` expires the overdue one.
- **Roles:**
  - adding and removing a role works;
  - a stage change for Middle-scoped student affairs works;
  - self change → `SELF_CHANGE_FORBIDDEN`; empty set → `ROLES_REQUIRED`; portal mix →
    `PORTAL_STAFF_MIX`; stages on a teacher → `STAGE_SCOPE_NOT_ALLOWED`; another school's user
    or a portal-only user → `NOT_FOUND`.
- **Last admin:** after A2 demotes A, A's attempt to demote A2 is refused. The permission is
  re-checked after the school lock, so the demoted caller gets `FORBIDDEN_PERMISSION`.
- **Revocation:** the same `teacherSa` session reads 3 students, then 0 on its next statement
  after `deactivate_user`.
- **Permissions:** accountant and principal get `FORBIDDEN_PERMISSION` on every management
  call; the principal can list users.
- **Grace:** invite, add role, reactivate and a mixed change give `WRITES_GATED`; deactivate and
  role removal succeed.
- **Super-admin:** `superadmin_set_school_admin` reactivates the principal as school_admin, and
  the super-admin still reads 0 `access_audit_entry` rows.
- **Immutability:** an UPDATE or DELETE on `access_audit_entry` by the service role gives
  `AUDIT_IMMUTABLE`. The two FK cascades still work: deleting a user nulls its reference, and
  deleting a school removes its audit rows.
- **Audit rows:** exactly one per logical change (`role_added` 4, `role_removed` 4,
  `stage_scope_changed` 1, `user_deactivated` 2, `user_reactivated` 2, plus the invitation rows).

## US3 migrations 0043–0044: live apply (T052), 2026-11-26

- **Owner approval:** the owner approved in chat ("Approved, apply them"). A pre-check confirmed
  none of the new objects existed and that `pgcrypto` was already present. Applied through Supabase
  MCP `apply_migration` as `0043_invitation_access_audit` (it also installs `citext` into
  `extensions`) and `0044_user_management_functions`.
- **Transcription check:** the md5 over the bodies of all 21 functions created by 0044 on the live
  database equals the local reference (`108f81c2…`, 21/21).
- **Structure:**
  - `audit_access_policies()` returns 0 violations;
  - RLS is enabled and forced on `invitation` and `access_audit_entry`;
  - `authenticated` cannot read `invitation.token_hash`, anon cannot select from `invitation`, and
    `authenticated` cannot execute `accept_invitation`.
- **Behaviour in the real school, inside a block that always aborts (nothing persisted):**
  - **as the real school admin:** an invitation for teacher + student_affairs gives a 43-character
    token; a duplicate gives `EMAIL_IN_USE`; a self change gives `SELF_CHANGE_FORBIDDEN`;
    `list_school_users` lists the school's 3 users;
  - **as the service role:** `accept_invitation` creates the user with both roles, a second accept
    gives `INVITATION_INVALID`, and an `access_audit_entry` UPDATE gives `AUDIT_IMMUTABLE`;
  - **the new user:** reads 12 students, then 0 on the next statement after `deactivate_user`;
  - **the accountant:** `create_invitation` gives `FORBIDDEN_PERMISSION`;
  - **audit rows:** `invitation_sent` 1, `invitation_accepted` 1, `user_deactivated` 1.
- **Types:** regenerated. `pnpm -w typecheck` passes (8/8).

## US4 migration 0045: local verification (T066), 2026-11-26

Applied to a copy of the local US3 database (`us4`, Postgres 16, storage schema stubbed) with
`ON_ERROR_STOP` in one transaction. Every scenario ran inside a block that always aborts.

- **Policy audit:** `audit_access_policies()` returns 0 violations. The three new definer
  functions are on the reviewed allow-list; `safe_uuid` is not a definer. anon has no execute
  on `teacher_roster`, `register_student` or `teacher_can_see_student`, and gets `42501` on all
  of them and on `storage.objects`.
- **`register_student`:**
  - student affairs (school-wide) registers into Primary. The trigger generates the 2
    installments of the grade's fee structure; student affairs sees 0 of them, and
    `student_directory` gives `total_owed = NULL` for the new row;
  - an empty name gives `INVALID_INPUT`; an unknown grade, or a section of another grade, gives
    `NOT_FOUND`;
  - `saMiddle` gets `FORBIDDEN_PERMISSION` for Primary, succeeds for Middle, and a bare
    `student` insert is still refused (`42501`, 0038);
  - teacher + student affairs, the accountant (Phase 1 `students.write` default) and the school
    admin succeed;
  - the teacher, the principal and the guardian get `FORBIDDEN_PERMISSION`; the school B admin
    gets `NOT_FOUND` for school A's grade.
- **`teacher_roster`:**
  - the teacher gets 0 rows while `teacher_section_ids()` is the empty stub;
  - student affairs, the accountant and the guardian get `FORBIDDEN_PERMISSION`;
  - with a stubbed allocation of the Primary section, the roster lists only Primary students,
    with NULL guardian contact; `p_section_id` of the Middle section gives 0 rows;
  - with `students.guardian_contact` enabled for teachers, the contact is returned
    (`X|gX|+249…`).
- **`student-photos` bucket (objects for X, Y and a non-uuid path):**
  - **reads:** student affairs sees X and Y, `saMiddle` only Y, and the guardian of X only X; the
    principal and the admin see all school A photos; the teacher (no allocation) and the school B
    admin see 0; the non-uuid path is visible to nobody;
  - with the stubbed allocation, the teacher sees only X's photo;
  - **writes:** student affairs can upload for X, but not to a non-uuid path or a school B
    prefix; `saMiddle` cannot upload for X, and the teacher cannot upload at all; the admin can
    delete X's photo.
- **Fee indicator (added to 0045 after the first run):** the checked `student_directory` wrapper
  now folds `overdue` into `partial` or `unpaid` for indicator-only callers (spec: "paid /
  partially paid / unpaid, no amounts"):
  - **finance holders:** the accountant's results are byte-identical before and after 0045 (md5
    of all rows, of the `overdue` filter and of the 30-day due filter);
  - **indicator-only (student affairs with `students.fee_indicator` enabled):** X shows `partial`
    and Y `unpaid` (the accountant sees both as `overdue`), with every amount NULL. The `partial`
    filter returns X and the `unpaid` filter returns Y; `p_fin_status => 'overdue'` and
    `p_due_within_days` give `FORBIDDEN_PERMISSION`;
  - `audit_access_policies()` still returns 0 violations.
- **Money sorts (added to 0045):** `p_sort => 'owed_desc'` and `'oldest_overdue'` ordered the
  rows by amount owed and days overdue for callers who see no amounts, so the order alone
  revealed who owes most. Before 0045 the principal got 3 rows for both; after, both give
  `FORBIDDEN_PERMISSION`, and sorting by name still works. The accountant's orders are unchanged
  (`Y,X,Z` and `X,Y,Z`).

## US4 migration 0045: live apply (T066), 2026-11-26

- **Owner approval:** the owner approved in chat. A pre-check confirmed that the bucket, the
  photo policies and the new functions did not exist, that the live `student_directory`
  definition equals the local pre-0045 copy (md5 `c8ac1fe8…`), and that the live allow-list
  equals the 0044 list this migration extends (48 names, md5 `57a4f1e6…`). Applied through
  Supabase MCP `apply_migration` as `0045_new_role_functions`.
- **Transcription check:** the md5 of every function created or replaced (`safe_uuid`,
  `teacher_can_see_student`, `teacher_roster`, `register_student`, `student_directory`,
  `reviewed_definer_functions`) and of the four `student_photos_*` policies equals the local
  copy.
- **Structure:** the `student-photos` bucket is private (2 MB, JPEG/PNG/WebP);
  `audit_access_policies()` returns 0 violations; anon cannot execute `teacher_roster`,
  `register_student` or `teacher_can_see_student`.
- **Types:** regenerated; identical to the entries added by hand in T068. `pnpm -w typecheck`
  passes (8/8).

## Integration suites on the live project (T033, T045 database part), 2026-11-26

The owner supplied the project keys and approved running the suites on the live project
(temporary schools, users and payments with unique names, removed at the end).

- **US4 (`new-roles.test.ts`) after 0045:** 14 passed, 1 skipped (the stubbed-allocation case
  runs on a branch database only).
- **Full database suite (`pnpm --filter @erp/database test`):** 23 files, 1,334 passed, 2
  skipped, 1 failed. The failure was `migration-backfill`: 7 school users with no assignment.
  - **Cause:** test hygiene, not the backfill. In seven Phase 1 files `afterAll` deleted the
    accountant before `cleanupSchool`. The user delete fails silently while that user's
    `money_event` rows exist (the FKs from `money_event`, `audit_entry` and `discount` to `user`
    are NO ACTION). The school delete then removes the role assignment and leaves the user
    behind. This is also where the 10 orphans found before 0034 came from.
  - **Fix:** the seven files now clean up the school first (no assertion changed). The 7 orphans
    (all `t-accountant-…@example.test`, created by this run) were deleted from `public.user`
    and from Auth.
  - **Re-run:** `src/functions` 11 files, 36 passed; `migration-backfill` 4 passed; 0 school
    users without an assignment afterwards.
- **Phase 1 money suite and T024–T027:** all passed (part of the full run).
- **`get_advisors`:**
  - **Security:** `authenticated_security_definer_function_executable` lists the 51 reviewed
    definer functions; this is intended (each checks its permission, and
    `definer-exposure.test.ts` passed). `pg_trgm` in `public` (Phase 1) and leaked-password
    protection (an Auth dashboard setting) are unchanged.
  - **Performance (new with feature 002):** multiple permissive SELECT policies on
    `role_assignment`, `role_assignment_stage` and `portal_link` (own row + `users.read`), and
    unindexed FKs on `access_audit_entry`, `invitation.revoked_by`,
    `role_assignment.assigned_by`, `role_assignment_stage.stage_id`, the catalogue tables and
    `user.deactivated_by`. These are left for a follow-up migration (owner review), so T033
    stays open.

## Playwright suite on the live project (T045 web part, T069), 2026-11-26

`next dev` against the live project, `E2E_ACCESS_FIXTURE=1`, the container's preinstalled
Chromium (the pinned Playwright's headless shell is not installed here; a local, uncommitted
config only set `launchOptions.executablePath`). No assertion was edited.

- **First run:** 33 passed, 9 skipped, 11 failed.
- **US4 new roles (`us4-new-roles.spec.ts`):** 3/3 passed (stage-scoped register + enroll with
  no amounts on the profile, totals-only principal dashboard with `/reports/receivables`
  forbidden, teacher `/students` forbidden). The fixture teardown left no orphans.
- **Found and fixed (pre-existing since Phase 1):** 7 failures in US3, US4 money events and
  US9. Every money RPC committed, but the web action threw a `ZodError`:
  `student_balance_after` was parsed with the non-negative `Money` schema, and the test student
  "طالب اختبار 1" is in credit (−1413.00 after many runs of discounts and write-offs). A real
  school with a student in credit would see an error after every successful post. Output
  balances now use `SignedMoney`; submitted amounts stay `Money`
  (`packages/shared/src/schemas/money.test.ts`). **Re-run:** US3, US4 money events and US9
  18 passed.
- **Remaining failures, none caused by feature 002:**
  - `us1-onboard-school`: expects Arabic-Indic digits ("١٬٠٠٠"); the app deliberately formats
    with Western digits (`lib/format/number.ts`, LOCALE `en-US`). Stale assertion.
  - `us7-reminders` (2): the manual reminder needs the worker; `WORKER_URL` is not set in this
    run ("WORKER_URL / INTERNAL_DISPATCH_TOKEN غير مضبوطة").
  - `us8-lifecycle` grace: the seeded grace school's subscription has aged into the locked state
    (seed dates from July). Data ageing.
  - `students-directory` create → edit: the first click on a row menu right after the create
    dialog closes does nothing; a second click opens it. Reproduced identically with the
    pre-T068 student screens restored, so it predates this feature.
- **Gauntlet row check (Article X), read-only:** the last payment of the run in Gauntlet School A
  (receipt 43, 7.00) is fully allocated (7.00), has its `apply_fee_payment` audit row, and its
  receipt number is unique. The school's receipts are gapless; 7 payments were recorded during
  the run.
- **Cleanup:** the temporary students "طالب مؤقت …" (one left by the failed spec, three by the
  reproduction) were deleted; none had money events.


## US5 migration 0046: local verification (T071), 2026-11-26

Applied to a copy of the local US4 database (`us5`) with `ON_ERROR_STOP` in one transaction;
every scenario ran inside a block that always aborts. `audit_access_policies()` returns 0
violations, and anon gets `42501` on both new functions.

- **`optional_permission_matrix()`:** 6 rows, with only `viewer/finance.export` on by default.
  The school admin and the principal (`users.read`) can read it; student affairs gets
  `FORBIDDEN_PERMISSION`.
- **Catalogue only:** `principal/finance.read`, `teacher/finance.read`,
  `student_affairs/finance.write`, `principal/users.manage` and `guardian/finance.read` all
  give `NOT_GRANTABLE`; a NULL value gives `INVALID_INPUT`.
- **Next request:**
  - with the fee indicator on, student affairs sees `X=partial, Y=unpaid`; switched off, the
    same caller's next `student_directory` call returns NULL for all;
  - the viewer's `has_perm('finance.export')` goes from true to false on the next statement.
- **Tenant isolation:** school B's matrix still shows `viewer/finance.export` on after school A
  switched it off.
- **Callers:** student affairs and the principal (no `users.manage`) get `FORBIDDEN_PERMISSION`.
- **Grace:** switching on gives `WRITES_GATED`; switching off is allowed.
- **Audit:** exactly one `optional_permission_changed` row per real change, with before/after
  `{role, key, enabled}`, the admin as actor and no target user. Setting a switch to the value
  it already has stores and logs nothing. `school_role_permission.changed_by` is the admin.

## US5 migration 0046: live apply and tests (T071, T070, T073), 2026-11-26

- **Owner approval:** the owner approved in chat. A pre-check confirmed that neither function
  existed and that the live allow-list equals the 0045 list this migration extends (51 names,
  md5 `3e2aada0…`). Applied through Supabase MCP `apply_migration` as
  `0046_optional_permission_functions`.
- **Transcription check:** the md5 of `optional_permission_matrix`, `set_optional_permission`
  and `reviewed_definer_functions` equals the local copy. `audit_access_policies()` returns 0
  violations; anon cannot execute either function.
- **Types:** regenerated; identical to the entries added by hand in T072.
- **`optional-permissions.test.ts` on live:** 8 passed, 1 skipped (the teacher-roster case runs
  on a branch database only).
- **`us5-optional-permission.spec.ts` on live (Gauntlet School A):** passed. Switching
  "معلم: عرض بيانات ولي الأمر" on wrote exactly one `optional_permission_changed` row; the
  teacher section shows its 2 catalogue switches and no finance switch; the viewer's
  `/reports/receivables/export` returned 200, then 403 on the next request after "مطّلع: تصدير
  التقارير المالية" was switched off. Afterwards both switches are back at their defaults, and
  no orphaned test users remain.

---
description: "Task list for Role-Aware Access Control and New Staff Roles"
---

# Tasks: Role-Aware Access Control and New Staff Roles

**Input**: Design documents from `/specs/002-role-access-control/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ (access-matrix, rpc-contracts, worker-endpoints, web-routes), quickstart.md

**Tests**: INCLUDED. The spec requires them explicitly: FR-034 (direct-query matrix test for every
data set × role), FR-035 (automated policy audit), FR-036 (Phase 1 Playwright + Gauntlet pass
unchanged), SC-001/002/006/007/009. Constitution Article X (Gauntlet) and Article XIII
(Playwright) also apply. Within each story, write the tests first and confirm they FAIL before
implementing.

**Organization**: Tasks are grouped by user story (US1–US7, in spec priority order), so each
story can be implemented and verified as its own increment.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1–US7. Setup, Foundational and Polish tasks carry no story label.
- Every task names exact file paths.

## Path Conventions (multi-package `@erp/*` monorepo, see plan.md)

- `packages/shared/` → `@erp/shared` (permission vocabulary, matrix-as-data, Zod)
- `packages/database/` → `@erp/database` (migrations, SQL functions, seeds, Vitest integration tests, generated types)
- `packages/api/` → `@erp/api` (Express worker: invitation endpoints, manual-SMS auth, cron)
- `packages/web/` → `@erp/web` (Next.js 14: guards, screens, Playwright specs)

## Rules that apply to every task

- **All DB work goes through Supabase MCP** (`apply_migration`, `execute_sql` for read-only checks,
  `generate_typescript_types`, `get_advisors`). Never use ad-hoc SQL clients (Article XII).
- **Every migration in this feature touches RLS, and 0032a and 0039 also change money functions.** Write
  the SQL file, then **stop for owner review of the SQL**, and only then run `apply_migration`.
  The "apply" tasks below say this explicitly.
- Migrations are **forward-only**. Never edit a migration after it is applied. Fix with a new one.
- Every new table must pass the Article IV checklist: `school_id` (if tenant-scoped),
  `ENABLE` + `FORCE ROW LEVEL SECURITY`, role-aware policies only, explicit `GRANT`s, and no direct
  insert/update/delete for `authenticated` on access-control tables.
- Every new SECURITY DEFINER function: `set search_path = public`, `revoke execute … from public, anon`,
  an explicit `grant execute … to authenticated` (or `service_role` where the contract says
  service-role only), and Arabic `hint` text on raised errors (error codes in
  `contracts/access-matrix.md` §4).
- In RLS policies, always call the helpers as `(select public.has_perm('…'))` /
  `(select public.current_school_id())` so they are evaluated once per statement (research R13).
- Commit after each completed task (constitution Git discipline).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Shared vocabulary, schemas and test scaffolding that every later phase imports.

- [ ] T001 [P] Create the permission vocabulary in `packages/shared/src/access/keys.ts`: export `ROLES` (all 9 `user_role` values), `STAFF_ROLES`, `PORTAL_ROLES`, `STAGE_SCOPABLE_ROLES` (`principal`, `student_affairs`), the role precedence array (school_admin > principal > accountant > student_affairs > teacher > viewer > guardian > student), a `PermissionKey` string-literal union and a `PERMISSION_KEYS` array with every key in `contracts/access-matrix.md` §1 and §2 (with `module`, `action`, `stageScopable`, `enforced`, `labelAr` per key), `OPTIONAL_PERMISSIONS` (the 7 FR-010 rows with `role`, `key`, `defaultEnabled`, `labelAr`), and `NEVER_GRANTABLE` (role → forbidden keys, from the ✗ cells of access-matrix §1).
- [ ] T002 [P] Create Zod schemas in `packages/shared/src/schemas/access.ts` exactly as in `contracts/rpc-contracts.md` and `contracts/worker-endpoints.md`: `StaffRole`, `StageScope`, `OptionalPermissionKey`, `MyAccess`, `CreateInvitationInput`, `SetUserRolesInput` (`{ user_id, roles: StaffRole[] min 1, stage_scope }`), `UserIdInput`, `SetOptionalPermissionInput`, `AcceptInvitationInput`, `AccessAuditFilter` (`{ user_id?, action?, from?, to?, limit ≤500, before_id? }`), and `AccessErrorCode` (enum of the access-matrix §4 codes).
- [ ] T003 Export the new modules: add `export * from './access/index.js'` to `packages/shared/src/index.ts`, create `packages/shared/src/access/index.ts` re-exporting `keys.ts` (and later `matrix.ts`), add `export * from './access.js'` to `packages/shared/src/schemas/index.ts`, and add the `./access` subpath to `exports` in `packages/shared/package.json`.
- [ ] T004 [P] Add a unit test `packages/shared/src/access/keys.test.ts` asserting that every `OPTIONAL_PERMISSIONS` row is not in `NEVER_GRANTABLE` for its role, that every key in `OPTIONAL_PERMISSIONS` exists in `PERMISSION_KEYS`, and that `PERMISSION_KEYS` has no duplicates.
- [ ] T005 [P] Replace the template `packages/database/migrations/_templates/tenant_rls.sql` with a role-aware version: separate `select` / `insert` / `update` / `delete` policies whose conditions are `school_id = (select public.current_school_id()) and (select public.has_perm('{{READ_KEY}}'))` (and `{{WRITE_KEY}}` for writes). Add a header comment stating that a policy with only `school_id = current_school_id()` is forbidden (FR-020) and fails the policy audit.
- [ ] T006 Extend `packages/database/src/test-helpers/supabase.ts` (leave `createAuthedUser` and the `UserRole` type untouched for Phase 1 tests): add `AccessRole` (all 9 roles) and `createAuthedStaff(service, { roles: AccessRole[], schoolId, stages?: Partial<Record<'principal'|'student_affairs', string[]>>, displayName?, status? })`. It creates a confirmed auth user, inserts `public.user` with the primary role (precedence from T001), inserts any extra `role_assignment` rows and `role_assignment_stage` rows with the service client, signs in with the anon key and returns `AuthedUser`. Also add `linkPortal(service, { userId, studentId, schoolId, kind })` that inserts a `portal_link` row, and `setSubscriptionState(service, schoolId, 'active'|'grace'|'locked')`, which moves `subscription.period_end` accordingly.
- [ ] T007 Create the access fixture builder `packages/database/src/access/fixture.ts`. It exports `buildAccessFixture(service)`, which creates the population in quickstart §3: School A (active subscription) with sections in Primary and Middle grades of the current academic year, students X (Primary), Y (Middle), Z (Primary, withdrawn, no current enrollment), installments and one payment with a receipt for X (through `apply_fee_payment` as the accountant), an SMS log row, and a notification of each type. School B gets one student with a payment. Users (all through `createAuthedStaff`): `adminA`, `adminA2`, `principal`, `principalPrimary` (stages: Primary), `sa`, `saMiddle` (stages: Middle), `teacher` (no allocations), `accountant`, `viewer`, `teacherSa` (roles teacher+student_affairs), `guardianX` (guardian linked to X), `studentY` (student linked to Y), `adminB`, `superAdmin`. It returns typed handles plus `cleanup()`. Each call uses unique emails so suites can run in parallel. Export it for Playwright through a new `./test-fixtures` subpath in `packages/database/package.json` (`"./test-fixtures": "./src/access/fixture.ts"`), together with the T006 helpers.

**Checkpoint**: The shared vocabulary compiles (`pnpm --filter @erp/shared typecheck && pnpm --filter @erp/shared test`).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Role model, permission catalogue, portal link and decision helpers. Every user
story depends on them. No tenant policy changes yet, so Phase 1 behaviour is unchanged at the
end of this phase.

**⚠️ CRITICAL**: No user-story work can begin until this phase is complete.

### Hotfix first: Phase 1 definer exposure (rpc-contracts §E0)

Cross-tenant and anonymous access to finance functions exists in production today. T008–T011
can ship **on their own, before anything else in this feature**, because they change nothing
for legitimate same-school callers.

- [x] T008 Confirm the exposure on the live database through Supabase MCP. Run `get_advisors` (security), and read-only `execute_sql` over `information_schema.routine_privileges` / `pg_proc.proacl` for every function in contracts/rpc-contracts.md §E0 (who has EXECUTE: PUBLIC, anon, authenticated). Record the findings, and any difference from the repo source, in `specs/002-role-access-control/gauntlet-results.md` under "Hotfix 0032a: pre-check". If the live state differs, adjust T010's scope to the live state.
- [x] T009 [P] Write `packages/database/src/access/definer-exposure.test.ts` (Vitest, real Supabase; it must FAIL before T010). An **anon** client calling `dashboard_kpis`, `student_statement`, `receivables_aging`, `sms_credit_balance`, `consume_sms_credit` and `mark_notification_read` gets a permission error. A School A accountant (Phase 1 helper `createAuthedUser`) calling `dashboard_kpis(B)`, `student_statement(B student)`, `receivables_aging(B)`, `account_balance(B account)`, `student_balance(B student)`, `installment_running_balance(B installment)` and `sms_credit_balance(B)` gets `FORBIDDEN_SCHOOL`. The same calls with School A ids return the same results as before. `authenticated` gets a permission error on `consume_sms_credit`, `check_low_sms_credit` and `generate_installments`. Enrollment still generates installments through the trigger.
- [x] T010 Write `packages/database/migrations/0032a_harden_finance_definer_exposure.sql` (**money migration**) per contracts/rpc-contracts.md §E0. Revoke `execute … from public, anon` on the six functions. Revoke `consume_sms_credit`, `check_low_sms_credit` and `generate_installments` from `authenticated` and grant them to `service_role`. `create or replace` `dashboard_kpis`, `student_statement`, `receivables_aging`, `account_balance`, `student_balance`, `installment_running_balance` and `sms_credit_balance` with **unchanged signatures and bodies**, adding only a leading target-school check: resolve the target's `school_id`, then `raise exception 'FORBIDDEN_SCHOOL' using errcode = 'P0001', hint = 'لا تملك صلاحية الوصول لبيانات هذه المدرسة.'` unless it equals `public.current_school_id()` or the JWT role is `service_role`. SQL-language functions are converted to plpgsql only to be able to raise. Mirror each body into its source file under `packages/database/functions/`.
- [ ] T011 **Owner review gate**, then apply 0032a through Supabase MCP `apply_migration`. Run T009, then the Phase 1 money suite (`pnpm --filter @erp/database test`: reconciliation, receipt concurrency, idempotency, write gating, `dashboard_kpis`, `receivables`), and `packages/web/tests/us9-notifications.spec.ts` (it calls `check_low_sms_credit` through the service client). Re-run `get_advisors`. Record the results in `specs/002-role-access-control/gauntlet-results.md`. Deploy before continuing with this feature.

### Role model, catalogue, helpers

- [ ] T012 Write `packages/database/migrations/0033_user_role_values.sql`: `alter type public.user_role add value if not exists` for `principal`, `student_affairs`, `teacher`, `guardian`, `student` (its own migration, because added enum values cannot be used in the same transaction; research R2).
- [ ] T013 Write `packages/database/migrations/0034_role_model.sql` per data-model §1–§4: create the enums `user_status`, `invitation_state`, `portal_link_kind`, `access_audit_action`. Add `user.status user_status not null default 'active'`, `deactivated_at`, `deactivated_by`, and the two new checks. Create `role_assignment` (`unique(user_id, role)`, `check (role <> 'super_admin')`, indexes `(user_id)` and `(school_id, role)`) and `role_assignment_stage` (PK `(assignment_id, stage_id)`, `school_id`). Add the triggers: `role_assignment_guard` (BEFORE INSERT: school equals `user.school_id`, refuse portal+staff mix with `PORTAL_STAFF_MIX`), the `role_assignment_stage` check (parent role in principal/student_affairs, else `STAGE_SCOPE_NOT_ALLOWED`), `role_assignment_sync_primary` (AFTER INSERT/DELETE recomputes `user.role` by precedence) `user_sync_primary_assignment` (AFTER INSERT on `user`: insert the matching assignment when role ≠ super_admin and none exists), and `user_guard_direct_changes` (BEFORE UPDATE OR DELETE on `user`, per data-model §2). The guard refuses `school_id` changes, refuses `role`/`status` changes unless `current_setting('app.access_sync', true) = 'on'`, refuses deleting the last active school_admin (`LAST_ADMIN_PROTECTED`), exempts `service_role`, and otherwise raises `DIRECT_ROLE_CHANGE_FORBIDDEN`. `role_assignment_sync_primary` sets `set_config('app.access_sync','on', true)` before updating `user.role`. Backfill: `insert into role_assignment (user_id, school_id, role) select id, school_id, role from public.user where role <> 'super_admin' on conflict do nothing`. RLS on both new tables: select where `user_id = auth.uid()`, with no other policy yet (the `users.read` policy is added in T017 after `has_perm` exists). `grant select` to authenticated only.
- [ ] T014 Write `packages/database/migrations/0035_permission_catalogue.sql` per data-model §5: create `permission`, `role_permission_default`, `optional_permission` and `school_role_permission` (composite FK `(role, permission_key)` → `optional_permission`, index `(school_id, role)`). Seed `permission` with every key in contracts/access-matrix.md §1–§2 (`enforced = false` for the §2 module keys; `stage_scopable` per research R7), seed `role_permission_default` with every **D** cell of access-matrix §1 and the §2 defaults, and seed `optional_permission` with the 7 FR-010 rows (viewer `finance.export` default **true**). Add the catalogue invariant trigger on `role_permission_default` and `optional_permission`, which refuses any never-grantable (role, key) pair listed in data-model §5. RLS: `select using (true)` on the three catalogue tables (reference data). `school_role_permission`: select only by its own users later (T017). No write grants on any of the four.
- [ ] T015 Write `packages/database/migrations/0036_portal_link.sql` per data-model §6: `portal_link` with `unique (user_id, student_id)`, the partial unique `(user_id) where kind = 'self'`, index `(user_id)`, a trigger checking that the student's school equals `school_id` and the user's school, ENABLE + FORCE RLS, select where `user_id = auth.uid()`, `grant select` to authenticated only (no write grants: fixtures write through the service role, FR-017).
- [ ] T016 Write `packages/database/migrations/0037_access_helpers.sql` per data-model §9: redefine `current_school_id()` (returns the school only when `status = 'active'` and ≥1 assignment). Create `my_role_set()`, `has_perm(text)`, `perm_scope(text)`, `current_year_id()`, `student_stage_id(uuid)`, `can_read_student(uuid)`, `can_write_student(uuid)`, `teacher_section_ids()` (returns `'{}'::uuid[]`, with a comment saying feature 02 replaces the body), `portal_student_ids()`, `assert_perm(text)` (raises `FORBIDDEN_PERMISSION`, hint `لا تملك صلاحية تنفيذ هذا الإجراء.`) and `my_access()` returning the `MyAccess` shape of contracts/rpc-contracts.md §A. `has_perm`/`perm_scope` treat `current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role'` as allow-all / school-wide. All are `STABLE SECURITY DEFINER set search_path = public`. Revoke from public/anon and grant execute to authenticated.
- [ ] T017 In the same file `packages/database/migrations/0037_access_helpers.sql` (before applying), append the `users.read` select policies that depend on `has_perm`: `role_assignment`, `role_assignment_stage`, `portal_link` and `school_role_permission`, each with `school_id = (select current_school_id()) and (select has_perm('users.read'))`.
- [ ] T018 **Owner review gate**, then apply 0033 → 0037 in order through Supabase MCP `apply_migration`. Verify with `list_tables` (RLS enabled on the 7 new tables) and `execute_sql` (read-only): every existing school user has exactly one `role_assignment` equal to `user.role`, and there are zero rows with stages (US2-4, FR-018a).
- [ ] T019 Regenerate DB types through Supabase MCP `generate_typescript_types` into `packages/database/src/types/database.ts` (no hand edits). Run `pnpm -w typecheck`.
- [ ] T020 Create the matrix-as-data `packages/shared/src/access/matrix.ts`. Export `DATA_SETS` (every table in data-model §10 plus storage buckets) and `DERIVED_FUNCTIONS` (every function in access-matrix §3), and `ACCESS_EXPECTATIONS: Record<FixtureUser, Record<DataSetOrFn, Expectation>>`, where `Expectation = { read: 'all'|'scoped'|'totals'|'masked'|'own'|'none'|'refused', write?: 'allowed'|'refused', rowsOf?: ('X'|'Y'|'Z'|'B')[] }`, for the fixture users of T007. Values come straight from access-matrix §1/§3 (e.g. `teacher.money_event = { read: 'none' }`, `principal.dashboard_kpis = { read: 'totals' }`, `sa.student_directory = { read: 'masked', rowsOf: ['X','Y','Z'] }`, `principalPrimary.student = { read: 'scoped', rowsOf: ['X'] }`, `guardianX.student = { read: 'scoped', rowsOf: ['X'] }`). Re-export from `packages/shared/src/access/index.ts`.
- [ ] T021 Create the generic matrix runner `packages/database/src/access/run-matrix.ts`. `probeRead(client, dataSet)` selects through PostgREST/RPC with the user's own session and returns `{ rowIds, error }`. `probeWrite(client, dataSet, sample)` attempts a representative insert or update. `assertExpectation(result, expectation, fixture)` maps `rowsOf` letters to fixture ids and asserts, for `none`, zero rows and an error that does not mention the table or rows (no existence leak, US1-1), and for `refused`, an error code starting with `FORBIDDEN`. The file must be importable from every `*.test.ts` under `src/access/`.
- [ ] T022 Write `packages/database/src/access/foundation.test.ts` (Vitest, real Supabase, skips when `INTEGRATION_ENV_READY` is false): `my_access()` returns the right roles/permissions for each fixture user, `has_perm` is the union for `teacherSa`, `perm_scope('students.read')` is `[Primary]` for `principalPrimary` and null for `principal`, the trigger refuses `PORTAL_STAFF_MIX` and `STAGE_SCOPE_NOT_ALLOWED` (stages on teacher), a direct insert of `('teacher','finance.read')` into `school_role_permission` with the service client fails with an FK violation (SC-009), `current_school_id()` is null for a `status = 'deactivated'` user, and a super-admin client updating a school user's `role`, `status` or `school_id` directly is refused with `DIRECT_ROLE_CHANGE_FORBIDDEN` (U1).
- [ ] T023 Update the web guard `packages/web/lib/auth/guard.ts` per contracts/web-routes.md: widen `UserRole` to 9 roles, extend `AuthContext` (`roles`, `permissions: ReadonlySet<string>`, `stageScope`, `isStaff`, keep `role`), call `rpc('my_access')` inside `requireAuth()`, keep `requireRole` (now "holds any of"), and add `requireStaff()` (signs out and redirects to `/login?e=portal` or `/login?e=inactive`) and `requirePermission(...keys)` (redirects to `/forbidden`). Parse the RPC result with `MyAccess` from `@erp/shared/schemas`.

**Checkpoint**: The foundation is applied. `foundation.test.ts` passes. The Phase 1 Vitest suite (`pnpm --filter @erp/database test`) and Playwright suite still pass, because no Phase 1 policy has changed yet.

---

## Phase 3: User Story 1 - Data-layer enforcement replaces "any school user sees everything" (Priority: P1) 🎯 MVP

**Goal**: Every existing tenant data set and derived function is reachable only by roles the
matrix allows, within the caller's scope, even through direct API queries (FR-013, FR-019–FR-021).

**Independent Test**: With the T007 fixture, query every data set and derived function directly
as each user with their own session and compare with `ACCESS_EXPECTATIONS`. No screens are
involved.

### Tests for User Story 1 (write first, must FAIL before T028)

- [ ] T024 [P] [US1] Write `packages/database/src/access/matrix.test.ts`: `describe.each` over the fixture users × `DATA_SETS` ∪ `DERIVED_FUNCTIONS`, using `run-matrix.ts` and `ACCESS_EXPECTATIONS`. Include explicit named cases for spec US1-1 (teacher → `money_event` 0 rows, no leak), US1-2 (teacher → `student_statement`, `receivables_aging`, `dashboard_kpis`, `account_balance`, `student_balance`, `student_financial_summary` refused/empty), US1-3 (`sa` → `student_directory` has identity fields, every finance column null, `fin_status` null), US1-4 (teacher → `student`, `section`, `enrollment`, `academic_year` 0 rows) and US1-5 (every School A user → School B rows 0). Add the viewer → `apply_fee_payment` refused case (Phase 1 gap, research R0), the principal → `dashboard_kpis` totals-subset keys only, the `principalPrimary` → Y not visible, and Z (withdrawn) visible only to school-wide roles. Repeat the T009 cross-school cases (School B ids as each School A role) and anon cases against the hardened bodies, so 0039 cannot reintroduce the exposure.
- [ ] T025 [P] [US1] Write `packages/database/src/access/subscription-states.test.ts`: for `active`, `grace` and `locked` (via `setSubscriptionState`), the teacher's `money_event`, `installment` and `receipt_counter` reads return 0 rows (SC-004).
- [ ] T026 [P] [US1] Write `packages/database/src/access/policy-audit.test.ts`: with the service client, `rpc('audit_access_policies')` returns zero rows (FR-035, SC-002). Also add a guarded negative test (`describe.skipIf(!process.env.POLICY_AUDIT_NEGATIVE)`) that creates a throw-away table with a `school_id` + signed-in-only policy on a Supabase **branch** and asserts that the audit reports `signed_in_only_policy`.
- [ ] T027 [P] [US1] Write `packages/database/src/access/catalogue.test.ts`: the DB catalogue equals the shared vocabulary (every `PERMISSION_KEYS` key exists in `permission` with the same `enforced`/`stage_scopable`; `role_permission_default` equals the **D** cells; `optional_permission` equals `OPTIONAL_PERMISSIONS`). It also asserts that inserting a never-grantable default row is refused by the invariant trigger.

### Implementation for User Story 1

- [ ] T028 [US1] Write `packages/database/migrations/0038_rewrite_tenant_policies.sql` per data-model §10. For each of `school`, `subscription`, `academic_year`, `section`, `student`, `enrollment`, `account`, `fee_structure`, `fee_item`, `installment_schedule`, `reminder_rule`, `installment`, `money_event`, `payment_allocation`, `receipt_counter`, `discount`, `audit_entry`, `sms_message_log`, `sms_credit_topup`, `sms_credit_consumption`, `notification` and `user`: `drop policy` for every Phase 1 tenant policy (`*_tenant_rw`, `*_tenant_read`, `school_tenant_read`, `subscription_tenant_read`, `sms_topup_tenant_read`, `sms_consumption_tenant_read`, `user_same_school_select`, `notification_own_read`, `school_admin_update_own`), then create the new per-command policies with the read/write keys in the data-model §10 table. Specifics: `section` select also allows `id = any((select teacher_section_ids()))`; `section`/`academic_year` stage scope is `grade.stage_id = any(perm_scope('structure.read'))` (sections) and school-wide for years. `student` select is `can_read_student(id)`, insert requires `(select perm_scope('students.write')) is null and (select has_perm('students.write'))`, update is `can_write_student(id)`, delete is `has_perm('students.delete')`. `enrollment` insert/update checks the grade's stage against `perm_scope('students.write')`. `notification` select is own rows and (`type` not in the money notification types or `has_perm('finance.read')`). `user` select is own row, or `users.read` for same-school users. Keep every super-admin policy unchanged. Keep the existing GRANTs (a GRANT is only the coarse gate).
- [ ] T029 [US1] In the same file `packages/database/migrations/0038_rewrite_tenant_policies.sql`, rewrite the storage policies. `money_attachments_tenant_rw` is replaced by a select policy (`finance.read`) and insert/update/delete policies (`finance.write`), keeping the existing bucket-path school check. `school_logos_admin_write` is replaced by `has_perm('settings.manage')`, keeping the path check. Copy the existing path expressions from `packages/database/migrations/0014_storage_money_attachments.sql` and `0027_school_logo.sql` verbatim.
- [ ] T030 [US1] Write `packages/database/migrations/0039_harden_derived_and_money_functions.sql` (**money migration**) per contracts/rpc-contracts.md §E, using `create or replace` with **unchanged signatures**, starting from the latest deployed body of each function (`packages/database/functions/*.sql`, `migrations/0021`, `0025`, `0029`, `0031`):
  - add `perform public.assert_perm('finance.write');` right after the existing school check in `apply_fee_payment`, `record_expense`, `record_transfer`, `record_refund`, `record_adjustment`, `apply_discount`, `reverse_event` and `record_opening_balance`;
  - **keep the 0032a target-school check in every body you replace** (start from the 0032a bodies, not the older ones), because a permission alone is not tenant-scoped;
  - add `assert_perm('finance.read')` to `student_statement`, `student_payments`, `receivables_aging`, `account_balance`, `installment_running_balance`, `student_balance` and `sms_credit_balance`. For the SQL-language functions, convert to plpgsql only where needed to raise, and keep the return types;
  - `student_financial_summary` and `student_installments` allow `finance.read`, or `has_perm('portal.linked') and p_student_id = any(portal_student_ids())`, else `FORBIDDEN_STUDENT`;
  - `dashboard_kpis`: `finance.read` gives the unchanged full payload. Otherwise `finance.totals` returns only `collected_month`, `collected_year`, `outstanding`, `collection_rate` and `overdue_count`, computed **without** calling `account_balance`. Otherwise it raises `FORBIDDEN_PERMISSION`;
  - `student_directory`: require `students.read`, filter rows to `perm_scope('students.read')` stages (null = all), return NULL for `total_charged`, `total_paid`, `total_discount`, `total_owed`, `overdue_amount`, `days_overdue`, `next_due_date`, `next_due_amount`, `installments_total` and `installments_settled` unless `finance.read`, return `fin_status` only with `finance.read` or `students.fee_indicator`, and raise `FORBIDDEN_PERMISSION` when `p_fin_status`/`p_due_within_days` is used without those keys.

  Also mirror each new body into the matching source file under `packages/database/functions/` (e.g. `apply_fee_payment.sql`, `student_statement.sql`, `dashboard_kpis.sql`, `receivables_aging.sql`, `derived_balances_v2.sql`).
- [ ] T031 [P] [US1] Write `packages/database/migrations/0040_notification_recipients.sql`: re-create the emitters from `packages/database/functions/emit_notifications.sql` (and update that source file) so that recipients are the school's `status = 'active'` users whose effective permissions include `finance.write`. Resolve this from `role_assignment` joined to `role_permission_default` plus enabled `optional_permission`/`school_role_permission`, instead of `user.role in ('school_admin','accountant')`. Phase 1 recipients were exactly school_admin + accountant, which are exactly the `finance.write` holders, so the recipient set for every Phase 1 school is unchanged (US2). Add the reasoning as a comment in the migration.
- [ ] T032 [P] [US1] Write `packages/database/migrations/0041_policy_audit_function.sql`: `audit_access_policies()` returning `(object text, kind text, detail text)` per research R11 and contracts/rpc-contracts.md §F. Checks: every `public` table with a `school_id` column has `relrowsecurity` and `relforcerowsecurity` and ≥1 policy. Every `pg_policies` row for `authenticated`/`public` whose `qual`/`with_check` does not match the allow-listed helpers (`has_perm`, `perm_scope`, `can_read_student`, `can_write_student`, `portal_student_ids`, `teacher_section_ids`, `current_is_super_admin`) or `auth.uid()` is flagged. Any policy or function body referencing `current_role()` outside `current_is_super_admin` is flagged. Every SECURITY DEFINER function executable by `authenticated` that is not in a literal reviewed allow-list array is flagged (fill it from contracts/rpc-contracts.md). Every SECURITY DEFINER function in `public` that `PUBLIC` or `anon` can execute is flagged (`definer_public_execute`). Never-grantable catalogue rows are flagged. Allow-list `stage`, `grade`, `permission`, `role_permission_default` and `optional_permission`. `revoke execute … from public, anon, authenticated; grant execute … to service_role`.
- [ ] T033 [US1] **Owner review gate** (RLS + money functions), then apply 0038 → 0041 through Supabase MCP `apply_migration`. Immediately run the Phase 1 money suite (`pnpm --filter @erp/database test -- apply_fee_payment money_events reverse_event receivables dashboard_kpis write_gating`) and T024–T027. Run Supabase MCP `get_advisors` (security + performance) and fix new warnings with a follow-up migration.
- [ ] T034 [US1] Regenerate types through Supabase MCP `generate_typescript_types` into `packages/database/src/types/database.ts`, and run `pnpm -w typecheck`.

**Checkpoint**: T024–T027 pass. No data-layer rule grants access just for being signed in. A teacher session gets nothing from the finance or student tables.

---

## Phase 4: User Story 2 - Existing finance users notice no change (Priority: P1)

**Goal**: school_admin, accountant, viewer and super-admin behave exactly as in Phase 1 in screens,
data, actions and write gating (FR-003, FR-005, FR-024, FR-036, SC-003, SC-008).

**Independent Test**: The full Phase 1 Playwright suite and the Gauntlet checks pass with no
assertion edits. The baseline matrix rows for the Phase 1 roles match.

### Tests for User Story 2

- [ ] T035 [P] [US2] Write `packages/database/src/access/phase1-baseline.test.ts`: as `adminA`, `accountant` and `viewer`, every Phase 1 data set returns the **same row ids** as a service-role read filtered to School A (read parity). The accountant can still call each money RPC, upsert a student, create a section/year/account/fee structure and enroll. The viewer is refused every write. The super-admin gets 0 rows from every finance table and from `access_audit_entry`, and still manages `school`/`subscription`/`sms_credit_topup` (US2-1..3, FR-024).
- [ ] T036 [P] [US2] Write `packages/database/src/access/migration-backfill.test.ts`: for every pre-existing `public.user` row (seeded through `createAuthedUser`, the Phase 1 helper), there is exactly one assignment equal to `user.role`, with no stages, and `my_access().roles` equals `[user.role]` (US2-4).

### Implementation for User Story 2

- [ ] T037 [US2] Write `packages/database/migrations/0042_manual_sms_authorization.sql`: `authorize_manual_sms(p_student_id uuid)` per contracts/rpc-contracts.md §D (`assert_perm('sms.send_manual')`, then `can_read_student(p_student_id)` else `FORBIDDEN_STUDENT`). Grant execute to authenticated. **Owner review**, then apply through Supabase MCP and regenerate types into `packages/database/src/types/database.ts`.
- [ ] T038 [US2] Update `packages/api/src/routes/dispatch-manual.ts` per contracts/worker-endpoints.md: require the `x-user-jwt` header, build a user-scoped Supabase client (new helper `packages/api/src/middleware/user-client.ts`, which creates an anon-key client with `global.headers.Authorization = Bearer <jwt>`), call `rpc('authorize_manual_sms', { p_student_id })` before the existing dispatch, and return 403 with the DB code on `FORBIDDEN_*` without dispatching or charging credit.
- [ ] T039 [US2] Update `packages/web/lib/actions/reminders.ts` `sendManualReminder` to forward the session access token (`supabase.auth.getSession()`) as `x-user-jwt`, and switch its guard to `requirePermission('sms.send_manual')`. The rule edits use `requirePermission('finance.write')`.
- [ ] T040 [P] [US2] Switch the server-action guards per the contracts/web-routes.md table: `packages/web/lib/actions/spine.ts` (`structure.write` for years/sections and current year, `finance.write` for accounts/fee structures, `students.write` for upsert/status/enroll, `students.delete` for delete), `packages/web/lib/actions/money-events.ts` (`finance.write`), `packages/web/lib/actions/payment-helpers.ts` (`finance.read`), and `packages/web/lib/actions/branding.ts` plus `packages/web/lib/storage/school-logo.ts` (`settings.manage`).
- [ ] T041 [P] [US2] Guard the exports: `packages/web/app/(school)/reports/receivables/export/route.ts` → `requirePermission('finance.export')`; `packages/web/app/(school)/students/export/route.ts` → `requirePermission('students.export')`. Return HTTP 403 (not a redirect) from route handlers when denied.
- [ ] T042 [US2] Replace role lists with permission keys in `packages/web/components/app-shell.tsx`: change `NAV[].roles` to `NAV[].perm` per the contracts/web-routes.md nav table, filter with `ctx.permissions.has(perm)`, keep the `mutate` lifecycle rule, and pass `permissions` instead of `role` from `packages/web/app/(school)/layout.tsx`. Switch that layout to `requireStaff()`.
- [ ] T043 [US2] Add page-level guards to every existing school page per the contracts/web-routes.md routes table. Use `requirePermission('finance.write')` in the `page.tsx` of `packages/web/app/(school)/payments/`, `expenses/`, `transfers/`, `refunds/` and `adjustments/`; `requirePermission('finance.read')` in `packages/web/app/(school)/reports/**/page.tsx` and `packages/web/app/(school)/sms/**/page.tsx`; `requirePermission('settings.read')` in `packages/web/app/(school)/settings/**/page.tsx`, except `settings/reminders` → `finance.read` and the years/sections pages → `structure.read`, with edit controls shown only with `structure.write` or `settings.manage`. `/dashboard` and `/students/**` are handled in US4. List each page touched in the commit message. For school_admin, accountant and viewer every guard passes where Phase 1 let them in, so `responsive-nav.spec.ts` and the US-specs still pass unchanged.
- [ ] T044 [US2] Update `packages/web/app/page.tsx` routing per contracts/web-routes.md: super_admin → `/schools`; `finance.totals` → `/dashboard`; otherwise `/home`. For Phase 1 roles the result is unchanged.
- [ ] T045 [US2] Regression run (no assertion edits allowed): `pnpm --filter @erp/database test` (the full Phase 1 suite: reconciliation, receipt concurrency, idempotency, write gating) and `pnpm --filter @erp/web test:e2e` (the full Phase 1 Playwright suite incl. `responsive-nav.spec.ts`, `us3-fee-payment.spec.ts`, `us4-money-events.spec.ts`). Then do the Gauntlet row check through Supabase MCP `execute_sql` (read-only) for one payment recorded during the run (Article X). Record the results in `specs/002-role-access-control/gauntlet-results.md`.
- [ ] T046 [US2] Performance check (SC-008, quickstart §4.7): with the 2,000-student seed (`packages/database/seeds/test_gauntlet_data.sql`), run `EXPLAIN (ANALYZE, BUFFERS)` through Supabase MCP as the accountant JWT (`set local request.jwt.claims` + `set local role authenticated`) for `student_statement`, `receivables_aging`, `dashboard_kpis`, `student_directory` and the payments list query from `packages/web/lib/queries/money-events.ts`. Do this before (Phase 1 numbers from a branch without 0038/0039) and after. Confirm p95 regression ≤10% and that the `has_perm` init-plan appears once. Append the numbers to `specs/002-role-access-control/gauntlet-results.md`.

**Checkpoint**: US1 + US2 together are the safe, shippable MVP: the data layer is enforced and finance users see no change.

---

## Phase 5: User Story 3 - School admin invites and manages staff (Priority: P1)

**Goal**: A school admin lists users, invites staff by email with one or more roles, changes
roles and stages, deactivates/reactivates and revokes invites. Deactivation applies on the next
request (FR-025–FR-030, SC-005, SC-006).

**Independent Test**: As school admin, invite a teacher, accept as that teacher, log in, confirm
finance is not offered and is refused through URL and data API, then deactivate and confirm that
both a new and an already-open session are refused.

### Tests for User Story 3

- [ ] T047 [P] [US3] Write `packages/database/src/access/user-management.test.ts` for the contracts/rpc-contracts.md §B rules. Invite creates `pending` with `expires_at = created_at + 7 days`. `EMAIL_IN_USE` and a duplicate pending invite are refused. `issue_invitation_token` returns a 43-char token, and the stored hash ≠ the token. `accept_invitation` (service client) creates the user and assignments. Reusing the token, using a revoked token, or using one after `expires_at` (moved back with the service client) all give `INVITATION_INVALID`. `SELF_CHANGE_FORBIDDEN`. `LAST_ADMIN_PROTECTED` for deactivate and for role removal. Two concurrent `set_user_roles` calls removing `school_admin` from `adminA` and `adminA2` result in exactly one success (US3-4). Accountant/viewer/teacher/sa/principal calling every §B function get `FORBIDDEN_PERMISSION` (US3-6). In grace: `create_invitation`, `reactivate_user` and widening `set_user_roles` give `WRITES_GATED`, while `deactivate_user`, role removal and stage narrowing succeed (FR-023). `PORTAL_STAFF_MIX` is refused through `set_user_roles`. Every successful change writes exactly one `access_audit_entry` per logical change with correct actor/target/before/after (SC-007). The super-admin can call `superadmin_set_school_admin` on a deactivated School A user, who becomes an active school_admin with a `role_added` audit row, while the super-admin still reads 0 `access_audit_entry` rows. Non-super-admins get `FORBIDDEN_PERMISSION`.
- [ ] T048 [P] [US3] Write `packages/database/src/access/revocation.test.ts` (SC-006). Sign in `teacherSa` and keep the client open. A read of `student` succeeds. `adminA` calls `deactivate_user`. The **same client's** next select returns 0 rows and its next RPC raises. Repeat for removing the `student_affairs` role (students then 0 rows), for narrowing `saMiddle` to Primary (Y disappears). The switch-off revocation case lives in the US5 test file.
- [ ] T049 [P] [US3] Write `packages/web/tests/us3-invite-teacher.spec.ts` (Playwright, RTL assertions, role-based selectors). The admin opens `/users`, invites `teacher-<ts>@example.test` with role معلم, and the row shows "مدعو". The test reads the token via a test-only service helper that calls `issue_invitation_token` as the admin through the API (do **not** read email). It opens `/auth/accept-invite?token=…` (`dir=rtl`), sets a name and password, and lands on `/home`. The finance nav items are absent. `page.goto('/payments')` shows the Arabic `/forbidden` text. A direct `money_event` select with the teacher's session in the browser context returns `[]`. The admin deactivates the teacher in a second context, and the teacher's next navigation lands on `/login` with the inactive message (US3-1..3). Log the elapsed time from opening `/users` to the invite being sent, and from opening the accept link to `/home`, with `test.info().annotations` against the SC-005 targets (2 and 5 minutes).

### Implementation for User Story 3

- [ ] T050 [US3] Write `packages/database/migrations/0043_invitation_access_audit.sql` per data-model §7–§8: enable `citext` and `pgcrypto` if missing. Create `invitation` (partial unique pending `(school_id, email)`, roles check, `expires_at` default `now() + interval '7 days'`, `revoke select (token_hash) on public.invitation from authenticated`) and `access_audit_entry` (identity PK, indexes `(school_id, occurred_at desc)`, `(school_id, target_user_id)`, `(school_id, action)`, a `BEFORE UPDATE OR DELETE` trigger raising `AUDIT_IMMUTABLE`). Both get ENABLE + FORCE RLS and a select policy `school_id = (select current_school_id()) and (select has_perm('users.read'))`. Grant `select` only (no insert/update/delete to anyone; no super-admin policy). Add the internal helper `write_access_audit(p_school_id, p_actor, p_target, p_target_email, p_action, p_before, p_after)` (SECURITY DEFINER, `revoke execute from public, anon, authenticated`).
- [ ] T051 [US3] Write `packages/database/migrations/0044_user_management_functions.sql` per contracts/rpc-contracts.md §A–§B: `list_school_users()`, `list_invitations()` (no `token_hash`), `create_invitation`, `issue_invitation_token`, `revoke_invitation`, `accept_invitation` (service_role only), `set_user_roles`, `deactivate_user`, `reactivate_user` and `expire_invitations` (service_role only). Each mutating function applies the common checks in order (`assert_perm('users.manage')`, same-school target else `NOT_FOUND`, not self, `pg_advisory_xact_lock(hashtextextended(school_id::text, 0))`). Grants call `assert_writes_allowed`, revocations do not. `set_user_roles` diffs roles and stages into grant/revoke parts, refusing a mixed change in a gated state with `WRITES_GATED`. Audit rows are written through `write_access_audit` in the same txn, exactly one per role added/removed, per stage-scope change, and per invite/status change. The last-admin check counts other active users holding `school_admin`. Every function that changes `user.role`/`status` does `set_config('app.access_sync','on', true)` first (data-model §2). Also add `superadmin_set_school_admin(p_user_id)` per contracts/rpc-contracts.md §B (super-admin only, not write-gated, audited in the target school).
- [ ] T052 [US3] **Owner review gate**, then apply 0043 and 0044 through Supabase MCP `apply_migration`. Regenerate types into `packages/database/src/types/database.ts`. Run T047/T048.
- [ ] T053 [P] [US3] Create `packages/api/src/routes/invitations.ts` per contracts/worker-endpoints.md. `POST /internal/invitations/:id/send`: internal-token check, `x-user-jwt` user-scoped client (reuse `packages/api/src/middleware/user-client.ts` from T038), `rpc('issue_invitation_token')`, read the email, `auth.admin.inviteUserByEmail(email, { data: { invite_token, school_name }, redirectTo: APP_URL + '/auth/accept-invite' })` or `generateLink({ type: 'invite' })` on resend, and store `auth_user_id`. Rate limit 20/min per school. `POST /invitations/accept`: `AcceptInvitationInput` Zod validation, SHA-256 hash, `rpc('accept_invitation')` with the service client, `auth.admin.updateUserById(id, { password, email_confirm: true })`, `PASSWORD_SET_FAILED` handling, rate limit 10/min per IP, CORS restricted to `APP_URL`. Register both routes in `packages/api/src/app.ts`. Read `APP_URL` from env (fail fast if missing).
- [ ] T054 [P] [US3] Add invitation expiry to the worker's daily cron in `packages/api/src/cron/` (new `invitation-expiry.ts`, registered where the existing daily job is scheduled). It calls `rpc('expire_invitations')` with the service client, then deletes orphan auth users (`auth.admin.deleteUser`) for expired/revoked invitations whose `auth_user_id` has no `public.user` row. Log the counts.
- [ ] T055 [P] [US3] Add worker tests `packages/api/src/tests/invitations.test.ts` (Vitest, supertest style like the existing tests in `packages/api/src/tests/`): a missing internal token gives 401, a missing `x-user-jwt` gives 401, a DB `FORBIDDEN_PERMISSION` passes through as 403, a malformed accept body gives 400, and an invalid token gives 400 `INVITATION_INVALID`. Mock the Supabase admin client.
- [ ] T056 [US3] Create the server actions `packages/web/lib/actions/users.ts` (`'use server'`, Zod from `@erp/shared/schemas`): `inviteStaff` (rpc `create_invitation`, then `fetch(WORKER_URL + /internal/invitations/:id/send)` with `x-internal-token` and `x-user-jwt`), `resendInvitation`, `revokeInvitation`, `setUserRoles`, `deactivateUser` and `reactivateUser`. Each starts with `requirePermission('users.manage')`, maps DB error codes to `errors.access.*` messages and calls `revalidatePath('/users')`.
- [ ] T057 [P] [US3] Create the queries `packages/web/lib/queries/users.ts`: `listSchoolUsers()` and `listInvitations()` via RPC, returning typed rows (generated DB types). Format dates in Africa/Khartoum with `packages/web/lib/format/date.ts`.
- [ ] T058 [US3] Build the users page `packages/web/app/(school)/users/page.tsx` (guard `requirePermission('users.read')`, RTL). It shows a users table (name, email, roles as Arabic badges, stage scope, status مدعو/نشط/موقوف) using the existing table components, a pending-invitations section (resend/revoke), an invite dialog `packages/web/components/users/invite-dialog.tsx` (email, multi-select of the 6 staff roles, a stage multi-select shown only for the principal and student_affairs roles, using the `roles` i18n labels from the T063 task), and an edit sheet `packages/web/components/users/edit-user-sheet.tsx` (roles, stages, deactivate/reactivate). Hide the action controls without `users.manage`. Disable grant controls in grace/locked through the existing lifecycle gate (`packages/web/lib/auth/lifecycle-gate.ts`), but keep deactivate/remove role/narrow stages enabled (FR-023). Hide the edit controls on the caller's own row and show them read-only for portal-only users.
- [ ] T059 [P] [US3] Build the accept-invite page `packages/web/app/auth/accept-invite/page.tsx` plus a client form component (public route; `/auth` is already in `PUBLIC_PATHS` in `packages/web/middleware.ts`). Fields: display name, password, confirm. It posts to the worker `/invitations/accept` through a server action in `packages/web/lib/actions/invite-accept.ts`, then `signInWithPassword` and redirects to `/`. Arabic error for `INVITATION_INVALID` with a hint to ask the admin for a new invite. `PASSWORD_SET_FAILED` links to `/forgot-password`.
- [ ] T060 [P] [US3] Create the forbidden page `packages/web/app/forbidden/page.tsx` (`requireAuth`, Arabic "غير مصرّح لك بالوصول إلى هذه الصفحة", link to `/`, RTL, HTTP 403 status through `headers`/`notFound`-style handling or a static 403 notice).
- [ ] T061 [P] [US3] Create the landing page `packages/web/app/(school)/home/page.tsx` (`requireStaff`): greeting with the display name, the user's roles in Arabic, and cards linking to each module the user has a key for (from `ctx.permissions`). If there are none (a teacher before feature 02), show an Arabic note that modules will appear when they are enabled.
- [ ] T062 [US3] Update the login flow `packages/web/app/login/page.tsx` and its sign-in action. After `signInWithPassword`, call `rpc('my_access')`. If `status = 'deactivated'` or `school_id` is null for a non-super-admin, sign out and show "تم إيقاف حسابك، تواصل مع إدارة المدرسة". Read the `?e=inactive` / `?e=portal` query params set by `requireStaff()` to show the matching message.
- [ ] T063 [US3] Add Arabic messages to the next-intl files under `packages/web/i18n/` (follow the existing locale file layout): the namespaces `users`, `invite`, `forbidden`, `home`, `roles` (labels for all 9 roles: مدير النظام, مدير المدرسة, المدير الأكاديمي, شؤون الطلاب, معلم, محاسب, مطّلع, ولي أمر, طالب; and the 3 stages from `stage.label_ar`) and `errors.access` (one message per code in contracts/access-matrix.md §4). Add the nav entry `users` (المستخدمون) to `packages/web/components/app-shell.tsx` with `perm: 'users.read'` and an icon in `packages/web/components/nav-links.tsx` (`UserCog` from lucide-react).
- [ ] T064 [US3] Document the Supabase Auth invite template and redirect allow-list (quickstart §2) in `packages/api/README.md` (create if missing) and add `APP_URL` with a description to `.env.example`. Never commit values.

**Checkpoint**: T047–T049 pass. A school can onboard and offboard staff on its own.

---

## Phase 6: User Story 4 - New staff roles work within their default permissions (Priority: P2)

**Goal**: The principal, student affairs and teacher each get exactly their default matrix rights,
including stage scope, multi-role union and the teacher's limited fields (FR-007, FR-008,
FR-012, FR-016, FR-018a, FR-022).

**Independent Test**: Run the matrix rows for the new roles. Student affairs enrolls a student
(installments are generated; amounts are not visible to them). The teacher is refused student edits.

### Tests for User Story 4

- [ ] T065 [P] [US4] Write `packages/database/src/access/new-roles.test.ts`. `sa` registers a student via `register_student` (Primary grade), and the service client sees installments generated as for any enrollment, while `sa` reading `installment` gets 0 rows and `student_directory` shows the new student with null finance columns (US4-1). `sa` calling each money RPC, `apply_discount` and a `fee_structure` insert is refused (US4-2). The teacher inserting/updating/deleting `student`, `section`, `enrollment` and `academic_year` is refused (US4-3). The principal sees all students, `dashboard_kpis` returns the totals subset only, and `student_statement`, `receivables_aging`, `account_balance` and `money_event` are refused/0 rows (US4-4, US4-5). `teacherSa` can update a student and still gets 0 `money_event` rows (US4-6). `saMiddle` calling `register_student` with a Primary grade gets `FORBIDDEN_PERMISSION`. A direct `student` insert by `saMiddle` is refused, while one by `sa` (school-wide) succeeds. Moving Y's enrollment from Middle to Primary makes Y disappear for `saMiddle` on the next request (FR-018). `teacher_roster()` returns 0 rows (no allocations, FR-016). For a stubbed allocation, temporarily `create or replace teacher_section_ids()` on a Supabase **branch** only, behind `describe.skipIf(!process.env.ACCESS_BRANCH_DB)`: only the allocated section's students are returned with the FR-008 fields, and the guardian fields are null.

### Implementation for User Story 4

- [ ] T066 [US4] Write `packages/database/migrations/0045_new_role_functions.sql` per contracts/rpc-contracts.md §A/§C. `teacher_roster(p_section_id uuid default null)`: `assert_perm('students.read_limited')`, rows only for `section_id = any(teacher_section_ids())` in the current year, the FR-008 columns, and `guardian_name`/`guardian_phone` only when `has_perm('students.guardian_contact')`. `register_student(p_student jsonb, p_enrollment jsonb)`: `assert_perm('students.write')`, the grade's stage must be in `perm_scope('students.write')` when it is not null, `assert_writes_allowed`, then insert `student` and `enrollment` in one txn (the existing `enrollment_generate_installments` trigger runs), returning only `student_id`. Grant execute to authenticated. **Owner review**, then apply through Supabase MCP and regenerate types into `packages/database/src/types/database.ts`.
- [ ] T067 [US4] Totals-only dashboard: in `packages/web/app/(school)/dashboard/page.tsx` and `packages/web/lib/queries/dashboard.ts`, accept the subset payload (make the per-account, expense, net cash flow and SMS fields optional in the parsing schema) and render only the totals cards when `!ctx.permissions.has('finance.read')`. Hide the per-account list, the expenses/cash-flow cards and the SMS credit card, and do not render the charts that need per-account or expense data. Guard the page with `requirePermission('finance.totals')`. The rendering for Phase 1 roles is unchanged.
- [ ] T068 [US4] Student screens for non-finance roles: in `packages/web/app/(school)/students/` (list and profile pages) and `packages/web/lib/queries/students.ts`, hide the finance columns, finance filters (`fin_status`, due-within), balance cards and payment history when `!ctx.permissions.has('finance.read')`. Show a fee-standing badge (مدفوع / مدفوع جزئياً / غير مدفوع) when `students.fee_indicator` is present. Show the edit/enroll actions only with `students.write`. When `ctx.stageScope['students.write']` is non-null, use a combined "register + enroll" form that calls a new server action `registerStudent` in `packages/web/lib/actions/spine.ts` (rpc `register_student`), and limit the grade picker to the scoped stages. Guard the list with `requirePermission('students.read')`.
- [ ] T069 [P] [US4] Write `packages/web/tests/us4-new-roles.spec.ts` (Playwright, RTL). A student-affairs user enrolls a student through the UI and the profile page shows no amounts. A principal's dashboard shows the totals cards only, and `/reports/receivables` shows `/forbidden`. A teacher's `/students` shows `/forbidden`. Use fixture users seeded through a Playwright global-setup extension in `packages/web/tests/global-setup.ts` that calls `buildAccessFixture` (import from `@erp/database` test helpers) only when `E2E_ACCESS_FIXTURE=1`. Keep the existing setup behaviour unchanged otherwise.

**Checkpoint**: The new roles work within their defaults, and the multi-role union and stage scope are proven.

---

## Phase 7: User Story 5 - School admin adjusts optional permissions per role (Priority: P2)

**Goal**: The school admin switches only the FR-010 optional permissions on or off per role.
Anything else is refused at the data layer, and changes apply on the next request
(FR-010, FR-011, SC-009).

**Independent Test**: Toggle the teacher guardian-contact switch, confirm the teacher's direct query
changes and the audit row exists, and confirm that granting finance read to the teacher is refused through the API.

### Tests for User Story 5

- [ ] T070 [P] [US5] Write `packages/database/src/access/optional-permissions.test.ts`. `optional_permission_matrix()` lists 7 rows with defaults. `set_optional_permission('principal','finance.read', true)` makes the principal's `student_statement`/`money_event`/`receivables_aging` results equal the viewer's, while `apply_fee_payment` is still refused (US4-5, FR-012). Switching it off restores the totals-only view on the next request (US5-3). With an open `sa` client, enabling `students.fee_indicator` returns `fin_status`, and switching it off makes the same client's next `student_directory` call return null (SC-006). `('teacher','finance.read')`, `('student_affairs','finance.write')`, `('principal','users.manage')` and `('guardian','finance.read')` all give `NOT_GRANTABLE` (US5-2, SC-009). Switching on in grace gives `WRITES_GATED`, switching off in grace succeeds. A switch in School A does not affect School B (US5-1). Each change writes exactly one `optional_permission_changed` audit row. Non-admins get `FORBIDDEN_PERMISSION`. `teacher_roster` includes guardian contact once `students.guardian_contact` is on (run on the branch DB with a stubbed allocation, as in T065). Viewer `finance.export` defaults on, and switching it off makes `/reports/receivables/export` return 403 (assert through the web test in T073).

### Implementation for User Story 5

- [ ] T071 [US5] Write `packages/database/migrations/0046_optional_permission_functions.sql` per contracts/rpc-contracts.md §A/§B. `optional_permission_matrix()` (`users.read`) joins `optional_permission` with `school_role_permission` for `current_school_id()`. `set_optional_permission(p_role, p_key, p_enabled)` checks `users.manage`, `(role, key)` exists in `optional_permission` (else `NOT_GRANTABLE`), write-gates only when `p_enabled` is true, upserts `school_role_permission` with `changed_by`/`changed_at`, and writes one audit row through `write_access_audit` with before/after `{role,key,enabled}`. **Owner review**, then apply through Supabase MCP, regenerate types into `packages/database/src/types/database.ts`, and add the function names to the reviewed allow-list in `audit_access_policies` with a follow-up `create or replace` in this same migration.
- [ ] T072 [US5] Build the permissions page `packages/web/app/(school)/users/permissions/page.tsx` (`requirePermission('users.read')`), with a server action `setOptionalPermission` added to `packages/web/lib/actions/users.ts` (`requirePermission('users.manage')`). It shows one section per role, listing that role's default rights (from `role_permission_default` + `permission.label_ar`, read-only, with not-yet-enforced module keys marked "تُفعّل عند إطلاق الوحدة") and its optional switches as toggles (switch-on disabled in grace/locked, switch-off always enabled). There are no controls for anything outside the catalogue. Add a "الصلاحيات" tab link on `/users`, and add the Arabic strings to the `permissions` namespace under `packages/web/i18n/`.
- [ ] T073 [P] [US5] Write `packages/web/tests/us5-optional-permission.spec.ts` (Playwright, RTL). The admin toggles "المعلم: عرض بيانات ولي الأمر" on, and a service-client read of `access_audit_entry` shows exactly one `optional_permission_changed` row. The audit page itself is covered in the US6 spec. The teacher section lists no finance switch. Switching viewer export off makes the viewer's receivables export link return 403.

**Checkpoint**: Schools can tune the small catalogue, and nothing outside it can be granted.

---

## Phase 8: User Story 6 - Audit of role and permission changes (Priority: P2)

**Goal**: The school admin (and the principal with Users view) browses, filters and exports an
immutable log of every access change (FR-031–FR-033, SC-007).

**Independent Test**: Perform each kind of change once, confirm one entry each with correct
actor/target/before/after and Africa/Khartoum time, and confirm that edits/deletes are refused.

### Tests for User Story 6

- [ ] T074 [P] [US6] Write `packages/database/src/access/audit.test.ts`. After one of each `access_audit_action` (`invitation_sent`, `invitation_accepted`, `invitation_revoked`, `invitation_expired` via `expire_invitations`, `role_added`, `role_removed`, `stage_scope_changed`, `user_deactivated`, `user_reactivated`, `optional_permission_changed`), `list_access_audit()` as `adminA` returns exactly one row per action with the right actor/target/before/after, and `occurred_at` formats to the expected Africa/Khartoum wall time. `update`/`delete` on `access_audit_entry` with the **service** client raise `AUDIT_IMMUTABLE`, and with `adminA` they affect 0 rows or are refused (US6-2). The teacher, accountant, viewer and sa select 0 rows and `list_access_audit` gives `FORBIDDEN_PERMISSION` (US6-3). The principal can read. The super-admin gets 0 rows. Filtering by user, action and date range, plus keyset paging with `p_before_id`, returns the correct subsets.
- [ ] T075 [P] [US6] Write `packages/web/tests/us6-access-audit.spec.ts` (Playwright, RTL). The admin opens `/users/audit` and sees the entry "إضافة دور: المدير الأكاديمي" with a Khartoum timestamp (US6-1). The filters narrow the rows. The CSV export downloads with Arabic headers (التاريخ, المنفّذ, المستخدم المستهدف, الإجراء, قبل, بعد) and a UTF-8 BOM.

### Implementation for User Story 6

- [ ] T076 [US6] Write `packages/database/migrations/0047_access_audit_read.sql`: `list_access_audit(p_user_id, p_action, p_from, p_to, p_limit default 100, p_before_id)` per contracts/rpc-contracts.md §A (`assert_perm('users.read')`, school from `current_school_id()`, joins display names, `order by id desc`, `limit least(p_limit, 500)`), and add it to the `audit_access_policies` allow-list. **Owner review**, then apply through Supabase MCP and regenerate types into `packages/database/src/types/database.ts`.
- [ ] T077 [US6] Build the audit page `packages/web/app/(school)/users/audit/page.tsx` (`requirePermission('users.read')`) with filters (user select, action select with Arabic labels, a date range in Africa/Khartoum converted to UTC bounds) and a paged table showing before/after as readable Arabic diffs (e.g. "الأدوار: معلم ← معلم، شؤون الطلاب"). Add `listAccessAudit` to `packages/web/lib/queries/users.ts`, the `accessAudit` namespace strings under `packages/web/i18n/`, and an "سجل الصلاحيات" tab link on `/users`.
- [ ] T078 [US6] Create the export route `packages/web/app/(school)/users/audit/export/route.ts` (`requirePermission('users.read')`; 403 otherwise). It pages through `list_access_audit` with the same filters, writes a CSV with a UTF-8 BOM, Arabic headers and Africa/Khartoum times, following the pattern in `packages/web/lib/export/students-export.ts` (FR-033).

**Checkpoint**: Every access change is visible, filterable, exportable and cannot be changed.

---

## Phase 9: User Story 7 - Reserved portal roles have defined (but not yet usable) access (Priority: P3)

**Goal**: The guardian and student roles exist with proven relationship scoping against
existing data. Staff login refuses them (FR-014, FR-017, FR-029).

**Independent Test**: With a guardian linked to X and a student linked to Y, query every data set
directly and confirm only X's (resp. Y's) permitted rows. Staff login refuses both.

### Tests for User Story 7

- [ ] T079 [P] [US7] Write `packages/database/src/access/portal.test.ts`. `guardianX`: `student`/`enrollment` give X only. `student_financial_summary(X)` and `student_installments(X)` work, `(Y)` gives `FORBIDDEN_STUDENT`. `money_event`, `account`, `receipt_counter`, `installment` (table), `sms_message_log`, `dashboard_kpis`, `receivables_aging`, `student_statement(X)` and `student_payments(X)` give 0 rows or are refused (US7-1/2, FR-014). After linking the guardian to sibling Z as well, they see X and Z and still not Y (edge case: siblings). After unlinking X with the service client, the next request no longer returns X (FR-018). `studentY`: `student` gives Y only, every finance table and function gives 0 rows/refused, and `student_financial_summary(Y)` is refused (US7-3). `portal_link` insert by `guardianX` or `adminA` is refused (no write grant, FR-017). `set_user_roles` on `guardianX` gives `NOT_FOUND` (portal users are not editable as staff).
- [ ] T080 [P] [US7] Write `packages/web/tests/login-portal-refused.spec.ts` (Playwright, RTL). The `guardianX` and `studentY` fixture identities sign in at `/login` and stay on `/login` with "بوابة أولياء الأمور والطلاب غير متاحة بعد" (US7-4, FR-029). The session is cleared.

### Implementation for User Story 7

- [ ] T081 [US7] In the login action (`packages/web/app/login/page.tsx` and its action) and in `requireStaff()` in `packages/web/lib/auth/guard.ts`: when `my_access().is_staff` is false and the user is not the super-admin, sign out and redirect to `/login?e=portal` with the portal message. This builds on T062.
- [ ] T082 [US7] Show portal-only users on `/users` as read-only "مستخدم بوابة" rows (no edit sheet). In `packages/web/app/(school)/users/page.tsx`, use `is_portal` from `list_school_users()`.
- [ ] T083 [P] [US7] Add the guardian/student rows to `ACCESS_EXPECTATIONS` in `packages/shared/src/access/matrix.ts` if anything was deferred, and make sure `matrix.test.ts` (T024) covers `guardianX` and `studentY` for every data set and derived function (SC-001 covers all 9 roles).

**Checkpoint**: All 9 roles are proven against every existing data set. Feature 08 only has to add login screens and link flows.

---

## Phase 10: Polish & Cross-Cutting Concerns

- [ ] T084 [P] Add CI wiring so the policy audit and the matrix test run on every change: extend the existing pipeline in `turbo.json` (`test` depends on `^build`), and document in `packages/database/README.md` that `src/access/*.test.ts` and `policy-audit.test.ts` are required gates (FR-035, SC-002). They must not be skipped when the integration env is present.
- [ ] T085 [P] Update `packages/database/README.md` with the access model: the migrations 0033–0047, how to add a new tenant table (copy the role-aware `_templates/tenant_rls.sql`, add the keys to `0035`-style catalogue seeds through a new migration, update `ACCESS_EXPECTATIONS`), and the extension seams for feature 02 (`teacher_section_ids()` body) and feature 08 (`portal_link`).
- [ ] T086 [P] RTL/Arabic audit for the new screens: extend coverage in a **new** spec `packages/web/tests/rtl-access-screens.spec.ts` (do not edit `rtl-arabic-audit.spec.ts`), asserting `dir="rtl"`, Arabic labels and Khartoum-formatted dates on `/users`, `/users/permissions`, `/users/audit`, `/auth/accept-invite`, `/forbidden` and `/home` (FR-030, Article IX).
- [ ] T087 Run Supabase MCP `get_advisors` (security and performance) on the final schema. Resolve every new finding with a follow-up migration, or record a justified exception in `specs/002-role-access-control/gauntlet-results.md`.
- [ ] T088 Final full verification per quickstart §4: `pnpm -w typecheck`, `pnpm -w lint`, `pnpm --filter @erp/shared test`, `pnpm --filter @erp/database test`, `pnpm --filter @erp/api test`, `pnpm --filter @erp/web test:e2e`. Confirm that the Phase 1 tests pass with **no assertion edits** (`git diff --stat` on `packages/web/tests/us*.spec.ts`, `packages/web/tests/responsive-*.spec.ts`, `packages/web/tests/rtl-arabic-audit.spec.ts` and `packages/database/src/functions/*.test.ts` shows no changes, FR-036). Record the results in `specs/002-role-access-control/gauntlet-results.md`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies. T003 depends on T001/T002. T006 depends on the shape in data-model, and T007 on T006.
- **Hotfix (T008–T011, start of Phase 2)**: needs only T006 for the test helper. Ship and deploy it first, independent of the rest of the feature.
- **Foundational (Phase 2)**: depends on Setup and the hotfix. Migrations in order T012 → T013 → T014 → T015 → T016 → T017, then T018 (review + apply) → T019 → T020–T023. **It blocks every user story.**
- **US1 (Phase 3)**: depends on Foundational. T024–T027 are written first (they fail), then T028 → T029 (same file) → T030, with T031 and T032 in parallel, then T033 (review + apply) → T034.
- **US2 (Phase 4)**: depends on US1's applied migrations (it verifies them). T037 → T038 → T039. T040–T044 (including T043) can run in parallel with T037–T039. T045/T046 come last.
- **US3 (Phase 5)**: depends on Foundational and T023. It is meaningful after US1 (refusal of finance to the invited teacher). T050 → T051 → T052, then T053–T063 (T058 depends on T056/T057; T062 depends on T023).
- **US4 (Phase 6)**: depends on US1 (masked directory, totals dashboard functions). Independent of US3 for DB tests (the fixture seeds users directly).
- **US5 (Phase 7)**: depends on US3 (`write_access_audit`, the `/users` page shell).
- **US6 (Phase 8)**: depends on US3 (`access_audit_entry` and the producers of audit rows).
- **US7 (Phase 9)**: depends on US1 (portal branches in derived functions) and on T062 (login flow).
- **Polish (Phase 10)**: after all the stories you intend to ship.

### User Story Dependencies

```text
Setup → Hotfix → Foundational ─┬─▶ US1 ─┬─▶ US2  (P1, MVP = US1+US2)
                               │        ├─▶ US4
                               │        └─▶ US7
                               └─▶ US3 ─┬─▶ US5
                                        └─▶ US6
```

### Within Each User Story

- Tests first (they must fail), then the migration (written → **owner review** → applied through MCP), then type regeneration, then the worker, then the web actions/queries, then the pages, then Playwright.
- Each migration file is a single task chain, because tasks touching the same file are never [P].

### Parallel Opportunities

- Setup: T001, T002, T004 and T005 run in parallel. T006/T007 come after.
- US1 tests T024–T027 run in parallel. The migrations T031 and T032 can be written in parallel with T028–T030 (different files) but are applied together in T033.
- US2: T040 and T041 in parallel with the T037→T039 chain.
- US3: after T052, T053, T054, T055, T057, T059, T060 and T061 run in parallel. T056 → T058.
- After US1 is done, US4 and US7 can proceed in parallel with US3. After US3, US5 and US6 run in parallel.

---

## Parallel Example: User Story 1

```bash
# Write all US1 tests together (they must fail before the policy rewrite):
Task: "T024 [US1] matrix.test.ts in packages/database/src/access/"
Task: "T025 [US1] subscription-states.test.ts in packages/database/src/access/"
Task: "T026 [US1] policy-audit.test.ts in packages/database/src/access/"
Task: "T027 [US1] catalogue.test.ts in packages/database/src/access/"

# Write independent migrations together, then review and apply as one batch (T033):
Task: "T031 [US1] 0040_notification_recipients.sql"
Task: "T032 [US1] 0041_policy_audit_function.sql"
```

## Parallel Example: User Story 3

```bash
# After T052 (0043/0044 applied):
Task: "T053 [US3] packages/api/src/routes/invitations.ts"
Task: "T054 [US3] packages/api/src/cron/invitation-expiry.ts"
Task: "T055 [US3] packages/api/src/tests/invitations.test.ts"
Task: "T057 [US3] packages/web/lib/queries/users.ts"
Task: "T059 [US3] packages/web/app/auth/accept-invite/page.tsx"
Task: "T060 [US3] packages/web/app/forbidden/page.tsx"
Task: "T061 [US3] packages/web/app/(school)/home/page.tsx"
```

---

## Implementation Strategy

### MVP First (US1 + US2)

0. Ship the hotfix (T008–T011) immediately: it closes live cross-tenant exposure.
1. Phase 1 Setup, then Phase 2 Foundational (Phase 1 behaviour is still unchanged after it).
2. Phase 3 US1: rewrite the policies and harden the functions. This is the security fix, and it closes the viewer-RPC gap.
3. Phase 4 US2: prove there is no regression (Phase 1 suites unchanged, Gauntlet, performance).
4. **STOP and validate**, then deploy. Until US3 ships, no new-role user can exist, so the MVP is safe to release alone.

### Incremental Delivery

1. MVP (US1+US2): enforcement in production.
2. + US3: schools invite and offboard staff (the first teacher accounts become possible).
3. + US4: new-role defaults proven, with student-affairs enrollment and totals-only principal dashboards.
4. + US5 and US6 (parallel): optional switches and the audit browser.
5. + US7: portal scoping proven, so feature 08 is unblocked.

### Parallel Team Strategy

After Foundational, developer A takes US1 then US2, developer B takes US3 (DB functions first,
then the worker and screens), and developer C writes the US4/US7 tests against the fixture,
then implements once US1 lands. US5 and US6 split between B and C after US3.

---

## Notes

- [P] = different files and no dependency on an incomplete task. The same migration file is never [P].
- Never edit a migration after `apply_migration`. Fix with a new numbered migration, and update the quickstart §1 table.
- Phase 1 test files must not be edited (FR-036). New coverage goes into new spec/test files.
- Owner review is mandatory before applying every migration in this feature (Article XII).
- Commit after each task. Stop at any checkpoint to validate a story on its own.

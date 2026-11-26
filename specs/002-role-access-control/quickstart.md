# Quickstart: Role-Aware Access Control

How to apply, configure and verify feature `002-role-access-control` on top of the Phase 1
build. Read with [plan.md](./plan.md) and [contracts/](./contracts/). The base setup is in
[specs/001-fee-accounting/quickstart.md](../001-fee-accounting/quickstart.md).

## 1. Migrations (Supabase MCP only — Article XII)

Apply in order with `apply_migration`. **Every one touches RLS or money functions, so each
needs owner review of the SQL before apply.** Ship them together in one release, before the
users screens are enabled (no invitation can exist before then, so the intermediate states
expose nothing new).

| # | File | Content | Story |
|---|---|---|---|
| 0032a | `0032a_harden_finance_definer_exposure.sql` | **hotfix, ships first**: revoke PUBLIC/anon and internal-only EXECUTE; target-school checks (rpc-contracts §E0). Money migration. | foundational |
| 0033 | `0033_user_role_values.sql` | add enum values (own txn) | foundational |
| 0034 | `0034_role_model.sql` | `user.status`, `role_assignment(_stage)`, triggers, backfill from `user.role` | foundational |
| 0035 | `0035_permission_catalogue.sql` | `permission`, `role_permission_default`, `optional_permission`, `school_role_permission` + seeds from contracts/access-matrix.md | foundational |
| 0036 | `0036_portal_link.sql` | minimal link table (service-role writes only); created before the helpers that read it | foundational |
| 0037 | `0037_access_helpers.sql` | `current_school_id()` v2, `has_perm`, `perm_scope`, `can_read_student`, `can_write_student`, `teacher_section_ids` (empty), `portal_student_ids`, `assert_perm`, `my_access` | foundational |
| 0037a | `0037a_scope_access_sync_flag.sql` | forward fix for 0034: `trg_role_assignment_sync_primary` restores `app.access_sync` after its own UPDATE, so the role-model bypass does not leak to the rest of the transaction (found in T022 live verification) | foundational |
| 0038 | `0038_rewrite_tenant_policies.sql` | drop every Phase 1 `*_tenant_*` policy and create the role-aware ones (data-model §10), storage policies | US1 |
| 0039 | `0039_harden_derived_and_money_functions.sql` | §E permission checks (**money migration**) | US1 |
| 0040 | `0040_notification_recipients.sql` | emitters target `finance.read` holders | US1 |
| 0041 | `0041_policy_audit_function.sql` | `audit_access_policies()` | US1 |
| 0042 | `0042_manual_sms_authorization.sql` | `authorize_manual_sms()` | US2 |
| 0043 | `0043_invitation_access_audit.sql` | `invitation`, `access_audit_entry` + immutability trigger | US3 |
| 0044 | `0044_user_management_functions.sql` | `list_school_users`, `list_invitations`, invitation lifecycle, `set_user_roles`, `deactivate_user`, `reactivate_user`, `expire_invitations` | US3 |
| 0045 | `0045_new_role_functions.sql` | `teacher_roster()`, `register_student()`, private `student-photos` bucket + storage policies (FR-008a) | US4 |
| 0046 | `0046_optional_permission_functions.sql` | `optional_permission_matrix()`, `set_optional_permission()` | US5 |
| 0047 | `0047_access_audit_read.sql` | `list_access_audit()` | US6 |

Then:
- `generate_typescript_types` → `packages/database/src/types/database.ts` (no hand edits).
- `get_advisors` (security + performance) must show no new warnings.
- `list_tables` spot-check: every new table has RLS enabled.

## 2. Configuration

| Item | Where | Value |
|---|---|---|
| `APP_URL` | worker env | public web origin (new) |
| Invite email template | Supabase Auth → Email templates → Invite | Arabic RTL body; link `{{ .ConfirmationURL }}` (the worker's `redirectTo` already carries `?token=`; the raw token is never put in user metadata, see `packages/api/README.md`) |
| Redirect allow-list | Supabase Auth → URL configuration | add `${APP_URL}/auth/accept-invite**` |
| Existing | unchanged | `WORKER_URL`, `INTERNAL_DISPATCH_TOKEN`, `SUPABASE_*` |

Never hard-code any of these (Security & Secrets).

## 3. Test fixture

`packages/database/src/access/fixture.ts` (`buildAccessFixture`, exported as `@erp/database/test-fixtures`), plus the helper
`createAuthedStaff(service, { roles, schoolId, stages? })` in
`packages/database/src/test-helpers/supabase.ts`. The existing `createAuthedUser` is kept
unchanged. The fixture contains:

- School A (active) with the Gauntlet finance data (students X, Y, Z across Primary/Middle,
  payments, receipts, SMS log); School B with one student and one payment.
- One user per role in A: school_admin (×2, for last-admin tests), principal (school-wide),
  principal (Primary only), principal + viewer (multi-role), student_affairs (school-wide), student_affairs (Middle only),
  teacher (no allocations), accountant, viewer, a teacher+student_affairs multi-role user,
  guardian (linked to X), student (linked to Y).
- One school_admin in B, and the super-admin.

## 4. Verification

```bash
pnpm --filter @erp/database test            # Vitest: matrix, revocation, audit, policy audit, + all Phase 1 money tests
pnpm --filter @erp/web test:e2e             # Playwright: full Phase 1 suite (unchanged) + new access specs
```

### 4.1 Direct-query matrix (FR-034, SC-001)
`src/access/matrix.test.ts` loops over `ACCESS_EXPECTATIONS` (from `@erp/shared/access`). For
every role × table/function it queries **with that user's own session** and asserts the rows,
fields and write outcome. Required spot checks (spec acceptance scenarios):
- teacher → `money_event` returns 0 rows, with no error that reveals existence (US1-1, SC-004,
  repeated in active/grace/locked);
- teacher → `student_statement`, `receivables_aging`, `dashboard_kpis`, `account_balance`,
  `student_balance` are all refused (US1-2);
- student_affairs → `student_directory` returns identity fields, and every finance column is
  NULL (US1-3);
- teacher → `student`, `section`, `enrollment`, `academic_year` return 0 rows (US1-4);
- every role in A → School B tables return 0 rows (US1-5);
- principal → `dashboard_kpis` returns the totals subset only, and `student_statement` is
  refused. `principalViewer` (principal + viewer roles) matches the viewer's results, and
  `apply_fee_payment` is still refused (US4-4, US4-5). `set_optional_permission('principal',
  'finance.read', true)` gives `NOT_GRANTABLE` (Article XIV);
- `student-photos` bucket: a teacher, or a user of School B, cannot read a School A student's
  photo object or sign a URL for it. A school_admin's signed URL expires after 300 s (FR-008a);
- teacher+SA → can update a student, cannot read `money_event` (US4-6);
- guardian → only X's rows in `student`/`enrollment`; `student_financial_summary(X)` works,
  `(Y)` is refused, and `money_event` returns 0 (US7-1/2); student → only Y, and 0 finance rows
  (US7-3);
- stage-scoped principal (Primary) → no Middle students; a student moved to Middle disappears
  on the next request (FR-018, FR-018a);
- super-admin → 0 rows from every finance table and from `access_audit_entry` (US2-3, FR-024);
- viewer → `apply_fee_payment` RPC is refused (this closes the Phase 1 gap, research R0);
- School A accountant → every finance function called with School B ids (`dashboard_kpis(B)`,
  `student_statement(B student)`, `receivables_aging(B)`, `account_balance(B account)`,
  `student_balance`, `installment_running_balance`, `sms_credit_balance(B)`) gives
  `FORBIDDEN_SCHOOL`. An **anon** client gets a permission error on every definer function.
  `authenticated` cannot execute `consume_sms_credit`, `check_low_sms_credit` or
  `generate_installments` (hotfix 0032a).

### 4.2 Revocation (SC-006)
With one open client per user: read succeeds → admin calls `deactivate_user` → the same
client's next `select` returns 0 rows and its next RPC raises. Repeat for `set_user_roles`
(remove role), stage narrowing and `set_optional_permission(false)`.

### 4.3 User-management rules
- Last admin: with two admins, one can be deactivated, and then deactivating the second
  raises `LAST_ADMIN_PROTECTED`. Run two concurrent demotions and confirm exactly one
  succeeds (US3-4).
- Self change raises `SELF_CHANGE_FORBIDDEN` (US3-5). Accountant/viewer/teacher/SA/principal
  calling any §B function raises `FORBIDDEN_PERMISSION` (US3-6).
- Grace state: `create_invitation` / `reactivate_user` / switch-on raise `WRITES_GATED`;
  `deactivate_user` / role removal / switch-off succeed (FR-023).
- Never-grantable: `insert into school_role_permission (… 'teacher','finance.read' …)` through
  the service client fails with an FK violation, and the `set_optional_permission` RPC raises
  `NOT_GRANTABLE` (SC-009).
- Super-admin: a direct `update public.user set role/status/school_id` raises
  `DIRECT_ROLE_CHANGE_FORBIDDEN`. `superadmin_set_school_admin` makes a School A user an active
  admin and writes a `role_added` audit row the super-admin cannot read.
- Invitation: accept after `expires_at` (time travel by updating `expires_at` with the service
  client), reuse of a token and a revoked token all give `INVITATION_INVALID`.

### 4.4 Audit (SC-007)
Perform one of each `access_audit_action` and confirm exactly one row each, with actor,
target, before/after and a timestamp that renders in Africa/Khartoum. `update`/`delete` with
the **service** client raises `AUDIT_IMMUTABLE`. A non-admin's select returns 0 rows.

### 4.5 Policy audit (FR-035, SC-002)
`src/access/policy-audit.test.ts`: `rpc('audit_access_policies')` returns 0 rows. Add a
throw-away policy `using (school_id = current_school_id())` in a test branch to confirm that
the test fails on it.

### 4.6 Regression — The Gauntlet (FR-036, SC-003, Article X)
Unchanged and required, because money functions gained a check:
- reconciliation test (event sum = derived statement figure),
- receipt-number concurrency test (parallel payments: no gap, no duplicate),
- idempotency and write-gating tests,
- full Phase 1 Playwright suite with no assertion edits, and Supabase MCP row checks of one
  payment.

### 4.7 Performance (SC-008)
On the 2,000-student seed, run `EXPLAIN (ANALYZE, BUFFERS)` through Supabase MCP as the
accountant JWT for `student_statement`, `receivables_aging`, `dashboard_kpis`,
`student_directory` and the payments list, before and after 0038/0039. p95 regression must be
≤10%. The `has_perm` init-plan must appear once per statement.

### 4.8 New Playwright specs (Article XIII)
- `us3-invite-teacher.spec.ts`: admin invites → accept page (RTL) → teacher lands on `/home`,
  finance nav is absent, `/payments` shows `/forbidden` in Arabic → admin deactivates → the
  teacher's next navigation is refused.
- `us5-optional-permission.spec.ts`: toggle the teacher guardian-contact switch, confirm it
  appears in the audit page, and the grantable list shows no finance switch for the teacher.
- `us6-access-audit.spec.ts`: filters + CSV export; Arabic headers; Khartoum times.
- `login-portal-refused.spec.ts`: a guardian fixture signs in at `/login` and is refused
  (US7-4, FR-029).

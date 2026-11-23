# Research: Role-Aware Access Control and New Staff Roles

**Feature**: `002-role-access-control` | **Date**: 2026-11-23 | **Plan**: [plan.md](./plan.md)

This file resolves every open technical question in the plan's Technical Context. Each
entry gives the decision, why it was chosen, and the alternatives considered. It starts
with what the Phase 1 code base actually does today (R0), because "exactly as today"
(FR-003, US2) has to be pinned to the real build, not to the Phase 1 spec text.

---

## R0. Baseline: what Phase 1 actually enforces today

Found by reading `packages/database/migrations/0001`–`0032`, `packages/database/functions/*`
and `packages/web/lib/{auth,actions}`.

| Layer | Finding | Consequence for this feature |
|---|---|---|
| Role storage | `public.user.role` (enum `user_role`: super_admin, school_admin, accountant, viewer), one role per user. `current_role()` / `current_school_id()` are SECURITY DEFINER helpers that read `public.user` on every call (not JWT claims). | Revocation already works per request, which is the basis for immediate revocation (FR-028). Multi-role needs a new assignment table. |
| Tenant RLS | Almost every tenant table has one policy, `school_id = current_school_id()`, either `for all` (academic_year, section, student, enrollment, account, fee_structure, fee_item, installment_schedule, reminder_rule) or `for select` (installment, money_event, receipt_counter, audit_entry, payment_allocation, discount, sms_message_log, sms_credit_*). `school` and `subscription` have a same-school read. Storage `money-attachments` is tenant `for all`. | Every one of these is the "access just for being signed in to the school" pattern that FR-020 and FR-035 forbid. **All of them are rewritten.** |
| Role-aware RLS today | Only `public.user` (school_admin reads same school), `school` update and the `school-logos` bucket (school_admin), and `notification` (own rows). | Kept in spirit, re-expressed through permission keys. |
| Money/derived functions | SECURITY DEFINER. Most check **school only** (`school_id = current_school_id()`), never role. *Found in `/speckit-analyze`*: `dashboard_kpis`, `student_statement`, `receivables_aging`, the balance helpers and `sms_credit_balance` do **not** check the target's school at all. `dashboard_kpis`, `student_statement`, `receivables_aging`, `consume_sms_credit`, `sms_credit_balance` and `mark_notification_read` were never revoked from PUBLIC/anon. `consume_sms_credit`, `check_low_sms_credit` and `generate_installments` are executable by `authenticated` although only the worker and the enrollment trigger need them. These are cross-tenant exposures fixed by a standalone hotfix (rpc-contracts §E0). |
| Money/derived functions (role) | Role is never checked. `apply_fee_payment`, `record_*`, `apply_discount`, `reverse_event` can be called through RPC by a **viewer** today. `student_statement`, `receivables_aging`, `dashboard_kpis`, `student_directory`, `student_financial_summary/installments/payments`, `account_balance`, `student_balance`, `installment_running_balance` return full finance data to any same-school user. | A real Phase 1 gap: viewer write-blocking lives only in screens. This feature adds permission checks to every exposed definer function (FR-021). For accountant/admin/viewer, the behaviour reachable through the screens is unchanged. |
| Screen gating (`requireRole`) | `(school)` layout: school_admin, accountant, viewer. Spine writes (`createAcademicYear`, `setCurrentYear`, `createSection`, `createAccount`, `upsertStudent`, `setStudentStatus`, `createFeeStructure`, `enrollStudent`), reminder-rule edits and manual SMS: school_admin **and accountant**. `deleteStudent`, logo upload/removal, settings nav: school_admin only. Money events: school_admin, accountant. Exports (`/students/export`, `/reports/receivables/export`): any signed-in user, so viewer exports today. | Defines the **Phase 1 baseline** permission set (R4). Note that the accountant writes students, sections, years, accounts and fee structures today. FR-003 ("exactly their Phase 1 permissions") wins over the "view (as today)" shorthand in the FR-007 table. The viewer export switch defaults **on**. |
| Worker | `@erp/api` uses the service-role key. Manual SMS is triggered by web → `POST /internal/dispatch/manual` with a shared `INTERNAL_DISPATCH_TOKEN`; role is checked only in the web action. | The manual-SMS path must also check the caller's permission in the data layer (R10). |
| Tests | `@erp/database` Vitest integration tests use `createAuthedUser(service, role, schoolId)`, which inserts `public.user` directly. Playwright isolation specs exist, but many are `test.skip` for lack of per-role fixtures. | The new role model must keep `insert into public.user (…role…)` working (R2). A per-role fixture seed is added (R12). |

---

## R1. Where the permission decision is made

**Decision**: In Postgres. The decision uses product-fixed permission tables plus a small
set of `STABLE SECURITY DEFINER` helper functions (`has_perm`, `perm_scope`,
`can_read_student`, …) that read the caller's active status, role assignments, the school's
optional-permission settings and relationships **on every statement**. RLS policies and
every exposed definer function call these helpers. In policies, the helpers are wrapped in
`(select …)` so the planner evaluates them once per statement (init-plan), not once per row.

**Rationale**: This satisfies Article IV (isolation lives in the database), FR-019/020 and
FR-028. Because nothing is cached in the JWT, deactivation and revocation apply to the very
next request, including on already-open sessions, with no session-kill mechanism. The
Phase 1 helpers already work this way, so the per-request cost model is known.

**Alternatives considered**:
- *Custom JWT claims via a Supabase Auth hook* (roles and permissions in the token): rejected.
  Claims stay valid until the token refreshes (~1 h), which breaks FR-028/SC-006.
- *Checks in Next.js only*: rejected. That is exactly the Phase 1 weakness. Direct PostgREST
  calls bypass it.
- *One Postgres role per app role* (`SET ROLE teacher`): rejected. Supabase runs every user
  as `authenticated`, and multi-role unions plus per-school switches can't be expressed
  with database roles.

---

## R2. Multi-role storage and the legacy `user.role` column

**Decision**:
- New table `role_assignment(user_id, school_id, role, assigned_by, assigned_at)`, unique on
  `(user_id, role)`. Stage scope lives in a child table
  `role_assignment_stage(assignment_id, stage_id)`. No child rows means school-wide.
- `public.user.role` is **kept** as a denormalised *primary role*. It is still the identity
  marker for `super_admin`, and it lets existing code that reads `ctx.role` (and the
  existing test helper that inserts `public.user` rows) keep working. **No tenant policy or
  function may use it for authorization.** The policy audit (R11) enforces this.
- Trigger `user_sync_primary_assignment`: when a school user row is inserted with no
  assignments, it creates the matching assignment. This is the backfill path and keeps
  `createAuthedUser` working unchanged.
- Trigger on `role_assignment` insert/delete: recomputes `user.role` with a fixed precedence
  (school_admin > principal > accountant > student_affairs > teacher > viewer > guardian >
  student).
- Migration backfill: one assignment per existing school user, copied from `user.role`, with
  no stages (FR-018a: migrated assignments are school-wide; US2-4).

**Rationale**: One authority (assignments) for rights, and zero changes for existing users,
tests and screens. A child table gives real foreign keys to `stage` and makes stage-scope
diffs easy to audit.

**Alternatives considered**: a `roles user_role[]` array on `user` (no FK, awkward per-role
stage scope, harder audit diffs); dropping `user.role` (breaks every existing guard and test
helper at once, against FR-036).

The `user_role` enum gains `principal`, `student_affairs`, `teacher`, `guardian`, `student`.
`ALTER TYPE … ADD VALUE` cannot be used in the transaction that adds it, so it gets its own
migration (`0033`).

---

## R3. Permission model: keys, defaults, optional switches, never-grantable

**Decision**: Rights are expressed as **permission keys** (for example `finance.read`,
`students.write`). There are four product-owned tables, seeded by migration and read-only to
`authenticated`:
1. `permission` (key, module, action, `stage_scopable`, description_ar),
2. `role_permission_default` (role, key): the default matrix (FR-007) plus the Phase 1
   baseline (R4),
3. `optional_permission` (role, key, default_enabled): the FR-010 catalogue,
4. per-school settings in `school_role_permission(school_id, role, key, enabled, changed_by, changed_at)`,
   with a **composite FK to `optional_permission(role, key)`**.

Effective rights = ⋃ over the caller's assignments of (defaults for that role) ∪ (optional
keys for that role where `coalesce(school setting, default_enabled)`).

**Never-grantable set (FR-011) is enforced structurally.** A school setting can only
reference a row of the optional catalogue, so "finance.read for teacher" or "users.manage for
principal" cannot even be stored. No API, direct insert or crafted RPC can create it. A
catalogue invariant test also asserts that no `optional_permission` or
`role_permission_default` row puts a never-grantable key on a forbidden role.

**Rationale**: Default-deny falls out naturally. An unknown role has no default rows, so it
has no rights (FR-020). The FK makes SC-009 a schema property rather than a code path.

**Alternatives considered**: a JSON matrix in code (Next.js) with checks in TS (not data-layer
enforcement); a free-form per-school `(role, key)` grant table guarded by a trigger allow-list
(it works, but an FK is simpler and cannot be bypassed by trigger-disabling service code).

---

## R4. Mapping existing data sets to keys (the Phase 1 baseline)

**Decision**: These keys cover every existing data set. The full role × key table is in
[contracts/access-matrix.md](./contracts/access-matrix.md).

| Key | Gives | Default roles |
|---|---|---|
| `school.profile_read` | own `school` row (name, logo), own `subscription` lifecycle (for the read-only banner) | all staff roles, guardian, student |
| `finance.read` | all finance tables and finance-derived functions (FR-013) | school_admin, accountant, viewer; principal via optional |
| `finance.totals` | `dashboard_kpis` aggregate subset (FR-012) | school_admin, accountant, viewer, principal |
| `finance.write` | money RPCs, accounts, fee structures/items/schedules, reminder rules, money attachments | school_admin, accountant |
| `finance.export` | finance exports (receivables CSV/PDF) | school_admin, accountant; viewer via optional (default **on**) |
| `sms.send_manual` | manual reminder through the existing dispatch path | school_admin, accountant; student_affairs via optional |
| `students.read` | `student`, `enrollment` full identity incl. guardian contact; `student_directory` (finance columns masked unless `finance.read`) | school_admin, principal, student_affairs, accountant, viewer |
| `students.read_limited` | `teacher_roster()` only: FR-008 fields, scoped | teacher |
| `students.guardian_contact` | adds guardian name/phone to `teacher_roster()` | teacher via optional |
| `students.fee_indicator` | `fin_status` (paid/partial/unpaid, no amounts) in `student_directory` | student_affairs via optional |
| `students.write` | create/edit student, set status, enroll | school_admin, student_affairs, accountant (baseline) |
| `students.delete` | delete student (existing guard still applies) | school_admin |
| `students.export` | student export | school_admin, accountant, viewer, principal, student_affairs |
| `structure.read` | `academic_year`, `section` | everyone with `students.read`/`read_limited` |
| `structure.write` | create/edit academic years and sections, set current year | school_admin, accountant (baseline); principal via optional |
| `users.read` | `user` rows of the school, invitations, role assignments, access audit | school_admin, principal |
| `users.manage` | invite, change roles/stages, deactivate, reactivate, optional-permission switches | school_admin (never-grantable otherwise) |
| `settings.read` / `settings.manage` | settings screens, logo | read: school_admin, principal; manage: school_admin |
| `portal.linked` / `portal.self` | guardian's linked students / student's own record, plus FR-014 statement summary for guardian | guardian / student |
| `academics.*`, `attendance.*`, `homework.*`, `exams.*`, `announcements.*`, `cms.*` | defined now with FR-007 defaults, enforced when those modules ship | per FR-007 |

The FR-007 table says "accountant: Students view (as today)". Today the accountant also
creates and edits students, sections, years, accounts and fee structures and enrolls
students (R0). FR-003 and US2 require exactly today's behaviour, so the accountant keeps
`students.write` and `structure.write`. This is recorded as a spec note to confirm in
`/speckit-analyze`. It widens nothing compared with today.

---

## R5. Column limits for teachers and finance masking for non-finance roles

**Decision**:
- The teacher (and later guardian/student) **never gets a row from the base `student` /
  `enrollment` tables**. RLS on those tables requires `students.read` or the portal
  relationship. Teachers read students only through `teacher_roster(p_section_id uuid default null)`,
  a STABLE SECURITY DEFINER function. It returns exactly the FR-008 fields (name, photo,
  grade, section, enrollment status), plus guardian name/phone only when
  `students.guardian_contact` is on, and only for sections in `teacher_section_ids()`.
- `student_directory` keeps its signature (so the existing UI keeps working). The finance
  columns (`total_*`, `overdue_amount`, `days_overdue`, `next_due_*`, `installments_*`) come
  back **NULL** unless the caller has `finance.read`. `fin_status` comes back only with
  `finance.read` or `students.fee_indicator`. Finance filters (`p_fin_status`,
  `p_due_within_days`) raise `FORBIDDEN_PERMISSION` without one of those keys.

**Rationale**: RLS filters rows, not columns, and Postgres column GRANTs apply to the whole
`authenticated` role rather than to app roles. A definer function is the only per-app-role
column boundary.

**Alternatives considered**: a security-barrier view per role (needs one view per role ×
optional switch); column GRANTs (role-blind); separate tables for contact data (schema churn
for Phase 1 finance code).

---

## R6. Relationship scope sources that do not exist yet

**Decision**:
- **Teacher allocation (feature 02)**: `teacher_section_ids()` is created now and returns the
  empty set. Feature 02 replaces only its body (`create or replace`) to read its allocation
  table. No policy text changes. Until then teachers see zero academic/student rows (FR-016).
- **Guardian/student link (feature 08)**: a minimal `portal_link(id, school_id, user_id, student_id, kind guardian|self, created_at)`
  table is created now, because US7 needs real rows to prove the scoping. `authenticated`
  gets no insert/update/delete grant, so only service-role test fixtures write it (FR-017).
  Feature 08 adds the flows and may add columns. Guardian linking keeps using
  `student.guardian_name/phone` as the contact record; `portal_link` only binds an auth user
  to a student and duplicates no contact data.
- `portal_student_ids()` returns the student ids linked to the caller.

**Rationale**: Feature 02 and 08 then only add data and screens, never security rules, which
is the stated purpose of US7.

---

## R7. Stage scope (FR-018a)

**Decision**: `perm_scope(key)` returns `NULL` (school-wide) or a `uuid[]` of stage ids. If any
assignment that grants the key is school-wide, the result is school-wide. Otherwise it is the
union of the stages. Only keys flagged `stage_scopable` (students.*, structure.read,
academics/attendance/homework/exams/announcements audience) are narrowed. Users, settings,
CMS and finance totals ignore stages. A student is "in stage S" when their enrollment in the
school's **current** academic year has a grade whose `stage_id = S`. Unenrolled or withdrawn
students therefore match only school-wide scopes (edge case in the spec).

A stage-scoped student-affairs user cannot insert a bare student row, because there is no
stage to check yet. They create students through `register_student(…, p_enrollment)`, which
inserts the student and the enrollment together and checks the grade's stage. School-wide
writers (including the accountant) keep the existing two-step path, so the current UI is
unchanged.

**Alternatives considered**: a `created_by` column on `student`, so a stage-scoped creator
can see their unenrolled students (widens visibility in a way the spec does not describe).

---

## R8. Immediate revocation (FR-028, SC-006)

**Decision**: `current_school_id()` is redefined to return the school **only if** the caller's
`user.status = 'active'` and they hold at least one assignment. Every tenant policy and
definer function already gates on it, so deactivation and losing the last role close all
access at once. `has_perm` reads assignments and switches fresh on every statement. The web
guard re-reads `my_access()` on each server request. Menus may be stale until refresh, but
data is not.

`super_admin` is unaffected: the helper returns `NULL` for it, as it does today.

**Alternative considered**: revoking Supabase refresh tokens (`auth.admin.signOut`) on
deactivation. It is kept only as an optional extra in the worker, because it does not cover
the access token that is already issued.

---

## R9. Invitations with a 7-day expiry

**Decision**: Use app-owned invitation tokens delivered by Supabase Auth's existing mailer:
1. The web action calls RPC `create_invitation(email, roles, stages)` as the admin. It checks
   `users.manage`, write gating, the one-school rule and that the email is not already in use,
   stores the row (`pending`, `expires_at = now() + 7 days`) and writes an audit entry.
2. Web then calls worker `POST /internal/invitations/:id/send`, forwarding the admin's
   access token. The worker calls `issue_invitation_token(id)` **as the admin** (user-scoped
   client, so the permission is checked again in the DB), which creates a random token,
   stores only its SHA-256 hash and returns the raw token once. The worker then calls
   `auth.admin.inviteUserByEmail(email, { data: { invite_token }, redirectTo })`. The Arabic
   invite email template links to `/auth/accept-invite?token={{ .Data.invite_token }}`, not to
   Supabase's own short-lived confirmation link.
3. The invitee opens the page and enters a display name and password. Web posts to worker
   `POST /invitations/accept` (public, rate-limited, Zod-validated). The worker (service role)
   calls `accept_invitation(token_hash, display_name)`, which is service-role-only. That
   function locks the row, checks pending + unexpired + single use, creates `public.user`
   (status active) and the assignments, and writes the audit entry. The worker then sets the
   password with `auth.admin.updateUserById(…, { password, email_confirm: true })`. Web signs
   the user in.
4. Revocation (`revoke_invitation`) and expiry: the worker's existing daily cron calls
   `expire_invitations()`, which marks rows expired and audits them. It also deletes the
   orphan auth users that were never accepted.

**Rationale**: The expiry is fully ours (7 days, single use, revocable; FR-026). Supabase's
own email OTP expiry is capped well below 7 days. No new email provider is needed. The
service-role key stays in the worker, as today. Every privileged step is still decided in
the DB as the inviting admin.

**Alternatives considered**: Supabase's built-in invite link alone (expiry too short and not
revocable); a separate EmailProvider adapter (more infrastructure for no extra benefit now);
putting the service-role key in Next.js (wider secret exposure on Vercel than today).

---

## R10. User-management safety rules (FR-027, FR-023)

**Decision**: All changes go through SECURITY DEFINER functions. `authenticated` has **no**
direct write grants on `user`, `role_assignment`, `role_assignment_stage`,
`school_role_permission`, `invitation` or `access_audit_entry`. Each function:
- requires `users.manage`, and refuses if the target is the caller (`SELF_CHANGE_FORBIDDEN`)
  or belongs to another school (`NOT_FOUND`, so nothing is revealed);
- takes `pg_advisory_xact_lock(hashtextextended(school_id::text, 0))` so two admins demoting
  each other at the same time cannot leave a school with zero admins
  (`LAST_ADMIN_PROTECTED`);
- splits the change into grants and revocations. Grants call `assert_writes_allowed`
  (blocked in grace/locked). Revocations (remove role, narrow stages, switch off, deactivate)
  never call it, so they work in every subscription state;
- enforces FR-004: portal roles cannot be combined with staff roles, and `super_admin` cannot
  be assigned;
- writes exactly one `access_audit_entry` per logical change (SC-007).

Manual SMS for student affairs: `POST /internal/dispatch/manual` additionally receives the
caller's access token. The worker calls `authorize_manual_sms(student_id)` as that user (it
checks `sms.send_manual` and student scope) before it dispatches through the unchanged credit
path.

---

## R11. Automated policy audit (FR-035, SC-002)

**Decision**: A SQL function `audit_access_policies()` (EXECUTE granted to `service_role`
only) reads `pg_class`, `pg_policies` and `pg_proc` and returns violations. A Vitest test in
`@erp/database` fails if it returns any rows. It flags:
1. a `public` table with a `school_id` column that lacks `relrowsecurity` + `relforcerowsecurity`
   or has no policy;
2. any policy for `authenticated` whose `qual`/`with_check` does not reference one of the
   allow-listed decision helpers (`has_perm`, `perm_scope`, `can_read_student`,
   `can_write_student`, `portal_student_ids`, `teacher_section_ids`, `current_is_super_admin`)
   or an own-row predicate (`auth.uid()`);
3. any policy or exposed definer function that references `current_role()` other than
   through `current_is_super_admin()`;
4. any SECURITY DEFINER function that `authenticated` can EXECUTE and that is missing from
   the reviewed allow-list in `contracts/rpc-contracts.md`, and any SECURITY DEFINER function
   that `PUBLIC` or `anon` can EXECUTE (`definer_public_execute`);
5. a never-grantable key on a forbidden role in the catalogue tables (R3).

Reference tables (`stage`, `grade`) and the permission catalogue are allow-listed as
world-readable non-tenant data.

The same check also runs in CI through Supabase MCP `get_advisors` plus `execute_sql` on the
branch database during Gauntlet runs (Article XII).

---

## R12. Testing strategy (FR-034, FR-036, SC-001)

**Decision**:
- **Matrix as data**: `@erp/shared/access` exports `ACCESS_EXPECTATIONS`, which states for each
  data set and derived function the expected read (`all | scoped | totals | masked | none`)
  and writes per role. It is generated from the same seed as the DB catalogue, so screens,
  tests and DB cannot drift.
- **Direct-query matrix test** (`packages/database/src/access/matrix.test.ts`): one school
  fixture (`src/access/fixture.ts` + `createAuthedStaff(roles[], stages?)`). It has one
  user per role (9 roles), a teacher with no allocations, a stage-scoped principal (Primary), a
  teacher + student_affairs multi-role user, a guardian linked to Student X, a student linked to
  Y, and a second school B. For every table and function it queries **with that user's own
  session** through PostgREST/RPC and asserts the row count and fields. Denied cases assert
  zero rows or a `FORBIDDEN_*` error that reveals nothing (SC-001).
- **Revocation test**: an open session reads OK, the admin deactivates, then the same
  client's next request gets 0 rows. The same is repeated for role removal, stage narrowing
  and switch-off (SC-006).
- **Policy audit test** (R11).
- **Regression**: the existing Vitest money tests (reconciliation, receipt concurrency,
  idempotency, write gating), the Playwright suite and the Gauntlet run **unchanged** (FR-036).
  Money functions are re-verified because they gain a permission check (Article X).
- **New Playwright specs**: US3 invite → accept → teacher home → finance URL shows the Arabic
  "not permitted" page → deactivate → existing session refused; US5 switch toggle; US6 audit
  page + export. RTL assertions per Article XIII.

---

## R13. Performance (SC-008)

**Decision**:
- Indexes: `role_assignment(user_id)`, `role_assignment(school_id, role)`,
  `role_assignment_stage(assignment_id)`, `school_role_permission(school_id, role)`,
  `portal_link(user_id)`, and `enrollment(school_id, academic_year_id, student_id)` (already
  present as `enrollment_year_idx` + `enrollment_student_idx`).
- Helpers are `STABLE`, `SECURITY DEFINER`, `set search_path = public`, and are always called
  as `(select public.has_perm('…'))` in policies, so they are evaluated once per statement.
- Finance policies are a constant-per-statement boolean (`has_perm('finance.read')`), which
  adds nothing per row for the accountant's queries.
- Measured with the Phase 1 2,000-student Gauntlet seed: `EXPLAIN ANALYZE` of
  statement/aging/dashboard/directory queries as the accountant, before and after the
  migration, through Supabase MCP. Accept a p95 change of no more than 10%.

**Alternative considered**: materialising effective permissions per user in a table kept
fresh by triggers. It is not needed at ~150 users per school, and it adds a cache that can go
stale (against FR-028).

---

## R14. Screens

**Decision**:
- `requireAuth()` returns `roles[]`, `permissions: Set<string>`, `stageScopes` and `status`
  from a new RPC `my_access()`. `requireRole(...)` is kept for compatibility and means "holds
  any of". A new `requirePermission(key)` redirects to `/forbidden`, an Arabic RTL "غير مصرّح
  لك" page (US3-2).
- Nav items are filtered by permission key instead of by role. Phase 1 roles see the same
  items as before, because their keys map one-to-one to the old role lists (US2).
- New routes under `(school)`: `/home` (landing page for roles without a dashboard),
  `/users` (list, invite, edit roles/stages, deactivate/reactivate, revoke invite),
  `/users/permissions` (optional switches per role), `/users/audit` (filter + export CSV).
- Public route `/auth/accept-invite`.
- Staff login refusal (FR-029): after `signInWithPassword` the login action calls `my_access()`.
  If the user holds no staff role, it signs out and shows "تسجيل دخول البوابة غير متاح بعد".
  The `(school)` layout repeats the check (defense in depth).
- The dashboard page shows only the totals cards when the caller has `finance.totals` but not
  `finance.read`.

---

## Resolved: no remaining NEEDS CLARIFICATION

All Technical Context fields are resolved above. The R4 accountant note was settled in
`/speckit-analyze` by aligning spec FR-007 with FR-003 (footnote ¹). The same analysis found
the definer exposure added to R0, fixed by hotfix `0032a` (rpc-contracts §E0).

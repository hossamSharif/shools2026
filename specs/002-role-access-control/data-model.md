# Data Model: Role-Aware Access Control and New Staff Roles

**Feature**: `002-role-access-control` | **Date**: 2026-11-23 | **Research**: [research.md](./research.md)

All new tables live in `public` and are created through forward-only migrations applied with
Supabase MCP `apply_migration`. Every migration here touches RLS, so each needs **owner
review before apply** (Article XII). Timestamps are `timestamptz` stored in UTC and rendered
in Africa/Khartoum (Article VIII).

**New-table checklist (Article IV), for every table below**: `school_id` where the table is
tenant-scoped · `ENABLE` + `FORCE ROW LEVEL SECURITY` · explicit role-aware policies (no
"same school only" policy) · explicit `GRANT`s. `authenticated` gets **no** direct
insert/update/delete on any access-control table. All writes go through the definer
functions in [contracts/rpc-contracts.md](./contracts/rpc-contracts.md).

---

## 1. Enum changes

```sql
-- 0033_user_role_values (own migration: ADD VALUE cannot be used in the same txn)
alter type public.user_role add value 'principal';
alter type public.user_role add value 'student_affairs';
alter type public.user_role add value 'teacher';
alter type public.user_role add value 'guardian';
alter type public.user_role add value 'student';

create type public.user_status        as enum ('invited', 'active', 'deactivated');
create type public.invitation_state   as enum ('pending', 'accepted', 'revoked', 'expired');
create type public.portal_link_kind   as enum ('guardian', 'self');
create type public.access_audit_action as enum (
  'invitation_sent', 'invitation_accepted', 'invitation_revoked', 'invitation_expired',
  'role_added', 'role_removed', 'stage_scope_changed',
  'user_deactivated', 'user_reactivated',
  'optional_permission_changed'
);
```

Role groups (constants in SQL helpers and in `@erp/shared/access`):
- **staff**: school_admin, principal, student_affairs, teacher, accountant, viewer
- **portal**: guardian, student
- **operator**: super_admin (no school, no assignments)
- **stage-scopable roles**: principal, student_affairs

---

## 2. `public.user` (extended)

| Column | Type | Notes |
|---|---|---|
| id | uuid PK → auth.users | unchanged |
| role | user_role | unchanged type. **Meaning changes**: the *primary role*, kept in sync from assignments by trigger; used for authorization **only** to identify `super_admin` (through `current_is_super_admin()`). |
| school_id | uuid | unchanged; NULL only for super_admin |
| display_name | text | unchanged |
| **status** | user_status not null default `'active'` | new. Existing rows become `active`. |
| **deactivated_at** | timestamptz null | new |
| **deactivated_by** | uuid null → user | new |
| created_at | timestamptz | unchanged |

Constraints added: `status <> 'invited' or school_id is not null`; and `role <> 'super_admin' or status = 'active'`.

Triggers:
- `user_sync_primary_assignment` (AFTER INSERT): if `role <> 'super_admin'` and the user has no
  `role_assignment`, insert `(user_id, school_id, role)`. This is the backfill path, and it keeps
  existing fixtures that insert `public.user` directly working. It is also how the super-admin
  still creates a school's first admin (existing directory power, FR-024).
- `user_guard_direct_changes` (BEFORE UPDATE OR DELETE): the super-admin's existing
  `user_superadmin_all` policy would otherwise let it bypass the role model.
  - UPDATE: refuses changes to `school_id` (always), and to `role` or `status` unless the
    transaction-local setting `app.access_sync = 'on'` is set. Only the role-model triggers and
    the user-management definer functions set it.
  - DELETE: refuses deleting the last active `school_admin` of a school (`LAST_ADMIN_PROTECTED`).
  - `service_role` is exempt (test fixtures, worker). The error is `DIRECT_ROLE_CHANGE_FORBIDDEN`.
    To replace a school's admin, the super-admin calls `superadmin_set_school_admin`
    (rpc-contracts §B).

RLS (replaces `user_same_school_select`):
- `user_self_select`: `id = auth.uid()` (unchanged)
- `user_school_read`: `school_id = (select current_school_id()) and (select has_perm('users.read'))`
- `user_superadmin_all`: unchanged (Phase 1 directory powers, FR-024)

Grants: `select` to authenticated (unchanged). No insert/update/delete.

---

## 3. `public.role_assignment` (new)

| Column | Type | Notes |
|---|---|---|
| id | uuid PK default gen_random_uuid() | |
| school_id | uuid not null → school | tenant key; must equal the user's school (trigger check) |
| user_id | uuid not null → user on delete cascade | |
| role | user_role not null | `check (role <> 'super_admin')` |
| assigned_by | uuid null → user | NULL for migrated/backfilled rows |
| assigned_at | timestamptz not null default now() | |

- `unique (user_id, role)`
- Indexes: `(user_id)`, `(school_id, role)`
- Trigger `role_assignment_guard` (BEFORE INSERT): school matches `user.school_id`. It refuses
  to mix portal and staff roles on one user (FR-004 → `PORTAL_STAFF_MIX`).
- Trigger `role_assignment_sync_primary` (AFTER INSERT/DELETE): recompute `user.role` with the
  precedence school_admin > principal > accountant > student_affairs > teacher > viewer >
  guardian > student.
- RLS: select where `user_id = auth.uid()` **or** (`school_id = (select current_school_id())`
  and `(select has_perm('users.read'))`). No write policies.
- Grants: `select` to authenticated.

## 4. `public.role_assignment_stage` (new)

| Column | Type | Notes |
|---|---|---|
| assignment_id | uuid → role_assignment on delete cascade | PK part |
| stage_id | uuid → stage | PK part |
| school_id | uuid not null | denormalised for RLS/audit |

- PK `(assignment_id, stage_id)`. Trigger check: the parent role is `principal` or
  `student_affairs` (`STAGE_SCOPE_NOT_ALLOWED`).
- **No rows for an assignment = school-wide** (FR-018a). Migrated rows have none.
- RLS and grants: same as `role_assignment`.

---

## 5. Permission catalogue (product-fixed, not tenant-scoped)

### `public.permission`
| Column | Type | Notes |
|---|---|---|
| key | text PK | e.g. `finance.read` (full list in contracts/access-matrix.md) |
| module | text not null | finance, students, academics, attendance, homework, exams, announcements, cms, settings, users, school, portal |
| action | text not null | view, create, edit, approve, publish, delete, export, … |
| stage_scopable | boolean not null default false | true only for student/academic keys (R7) |
| enforced | boolean not null default true | false for keys of modules not yet shipped |
| label_ar | text not null | shown on the permissions screen |

### `public.role_permission_default`
| Column | Type |
|---|---|
| role | user_role, PK part |
| permission_key | text → permission, PK part |

### `public.optional_permission` (FR-010 catalogue)
| Column | Type | Notes |
|---|---|---|
| role | user_role, PK part | |
| permission_key | text → permission, PK part | |
| default_enabled | boolean not null | |
| label_ar | text not null | |

Seed rows (exactly FR-010):
| role | key | default |
|---|---|---|
| teacher | `students.guardian_contact` | off |
| teacher | `announcements.publish_own` | off |
| student_affairs | `students.fee_indicator` | off |
| student_affairs | `sms.send_manual` | off |
| principal | `structure.write` | off |
| viewer | `finance.export` | **on** (Phase 1 viewers export today, R0) |

- Catalogue invariant (check trigger + audit test): no `optional_permission` or
  `role_permission_default` row may give a **never-grantable** key to a forbidden role. These
  are: `finance.write` to anyone except school_admin/accountant; `finance.read` to principal,
  teacher, student_affairs, guardian, student; `users.manage` to anyone except school_admin; any
  `portal.*` scope widening.
- RLS: enabled, `select using (true)` for authenticated (reference data, allow-listed in the
  policy audit). No write grants. Changes happen only through migrations.

### `public.school_role_permission` (per-school switches)
| Column | Type | Notes |
|---|---|---|
| school_id | uuid → school, PK part | |
| role | user_role, PK part | |
| permission_key | text, PK part | |
| enabled | boolean not null | |
| changed_by | uuid → user | |
| changed_at | timestamptz default now() | |

- **FK `(role, permission_key)` → `optional_permission(role, permission_key)`**. Anything
  outside the catalogue cannot be stored (FR-011, SC-009).
- Index `(school_id, role)`.
- RLS: select where `school_id = (select current_school_id()) and (select has_perm('users.read'))`.
  No write policies (use `set_optional_permission`).

---

## 6. `public.portal_link` (new; minimal, completed by feature 08)

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| school_id | uuid not null → school | |
| user_id | uuid not null → user on delete cascade | holder of `guardian` or `student` role |
| student_id | uuid not null → student on delete cascade | must be same school (trigger) |
| kind | portal_link_kind not null | `guardian` (many per user, siblings) or `self` (exactly one per user) |
| created_at | timestamptz default now() | |

- `unique (user_id, student_id)`. Partial unique `(user_id) where kind = 'self'`.
- Index `(user_id)`.
- Guardian contact stays on `student.guardian_name/phone`, which is not duplicated (FR-017).
- RLS: select where `user_id = auth.uid()` or (`school_id = (select current_school_id())` and
  `(select has_perm('users.read'))`). **No write grant to authenticated**, so in this feature
  only service-role test fixtures create links.

---

## 7. `public.invitation` (new)

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| school_id | uuid not null → school | |
| email | citext not null | lower-cased; validated at the boundary |
| roles | user_role[] not null | staff roles only; non-empty |
| stage_scope | jsonb not null default '{}' | `{ "principal": [stage_id…], "student_affairs": [...] }` |
| state | invitation_state not null default 'pending' | |
| token_hash | bytea null | SHA-256 of the raw token; NULL until issued; rotated on resend |
| invited_by | uuid not null → user | |
| auth_user_id | uuid null | set when the Supabase auth user is created by the invite mail |
| expires_at | timestamptz not null | `created_at + interval '7 days'` (FR-026) |
| accepted_at / revoked_at / revoked_by | timestamptz / timestamptz / uuid | |
| created_at | timestamptz default now() | |

- Partial unique `(school_id, email) where state = 'pending'`.
- Check: `roles <@ array['school_admin','principal','student_affairs','teacher','accountant','viewer']::user_role[]`.
- State transitions (all audited):

```text
pending ──accept (valid token, now < expires_at)──▶ accepted   (creates user + assignments)
pending ──revoke (users.manage; allowed in any subscription state)──▶ revoked
pending ──expire_invitations() when now ≥ expires_at──▶ expired
accepted / revoked / expired: terminal (single-use)
```

- RLS: select where `school_id = (select current_school_id()) and (select has_perm('users.read'))`.
  `token_hash` is never selectable: a column privilege revoke from authenticated, and the list
  RPC excludes it. No write grants.

---

## 8. `public.access_audit_entry` (new, immutable)

| Column | Type | Notes |
|---|---|---|
| id | bigint generated always as identity PK | |
| school_id | uuid not null → school | |
| actor_id | uuid null → user | NULL only for system actions (e.g. `invitation_expired`) |
| target_user_id | uuid null → user | NULL for invite-only and permission-switch rows |
| target_email | citext null | for invitation rows |
| action | access_audit_action not null | |
| before | jsonb not null default '{}' | e.g. `{"roles":["teacher"]}` |
| after | jsonb not null default '{}' | e.g. `{"roles":["teacher","student_affairs"]}` |
| occurred_at | timestamptz not null default now() | UTC; rendered Africa/Khartoum |

- Index `(school_id, occurred_at desc)`, `(school_id, target_user_id)`, `(school_id, action)`.
- **Immutability (FR-032, SC-007)**: no update/delete grants to anyone. A
  `BEFORE UPDATE OR DELETE` trigger raises `AUDIT_IMMUTABLE`. Triggers also fire for the
  service role. Rows are inserted only by the definer functions, in the **same transaction**
  as the change they describe, exactly one row per logical change.
- RLS: select where `school_id = (select current_school_id()) and (select has_perm('users.read'))`.
  There is no super-admin policy, so the super-admin sees zero rows (FR-024).
- Separate from Phase 1 `audit_entry`, which stays finance-tier (`finance.read`).

---

## 9. Decision helpers (SQL functions)

All are `STABLE SECURITY DEFINER SET search_path = public`. EXECUTE is revoked from
public/anon. In policies they are always called as `(select fn(...))`.

| Function | Returns | Meaning |
|---|---|---|
| `current_school_id()` *(redefined)* | uuid | caller's school **only if** `status = 'active'` and ≥1 assignment, else NULL. NULL for super_admin (unchanged). |
| `current_is_super_admin()` | boolean | unchanged |
| `my_role_set()` | user_role[] | caller's assigned roles (empty if inactive) |
| `has_perm(key text)` | boolean | key is in the caller's effective set (any scope). `true` for a `service_role` JWT. |
| `perm_scope(key text)` | uuid[] | NULL = school-wide; else the union of stage ids; `'{}'` = no grant |
| `current_year_id()` | uuid | school's current academic year |
| `student_stage_id(student_id)` | uuid | stage of the student's current-year enrollment (NULL if none) |
| `can_read_student(student_id)` | boolean | `students.read` in scope, **or** student ∈ `portal_student_ids()` |
| `can_write_student(student_id)` | boolean | `students.write` in scope |
| `teacher_section_ids()` | uuid[] | **empty until feature 02** replaces the body |
| `portal_student_ids()` | uuid[] | students linked to the caller through `portal_link` |
| `assert_perm(key text)` | void | raises `FORBIDDEN_PERMISSION` (Arabic hint) unless `has_perm` |

Effective set (inside `has_perm` / `perm_scope`):

```sql
with a as (
  select ra.id, ra.role, ra.school_id
    from role_assignment ra join "user" u on u.id = ra.user_id
   where ra.user_id = auth.uid() and u.status = 'active'
), grants as (
  select a.id, d.permission_key from a join role_permission_default d on d.role = a.role
  union
  select a.id, o.permission_key
    from a join optional_permission o on o.role = a.role
    left join school_role_permission s
           on s.school_id = a.school_id and s.role = o.role and s.permission_key = o.permission_key
   where coalesce(s.enabled, o.default_enabled)
)
-- has_perm: exists(grants where permission_key = $1)
-- perm_scope: if any granting assignment has no stage rows (or key not stage_scopable) → NULL,
--             else array_agg(distinct stage_id) over the granting assignments' stage rows
```

---

## 10. Policy rewrite of existing tenant data (summary)

Every Phase 1 `*_tenant_rw` / `*_tenant_read` policy is dropped and replaced. All conditions
also include `school_id = (select current_school_id())`.

| Data set | Read condition | Write condition |
|---|---|---|
| school | `has_perm('school.profile_read')` on own row; super-admin all (unchanged) | update: `has_perm('settings.manage')` |
| subscription | `has_perm('school.profile_read')`; super-admin all | super-admin only (unchanged) |
| academic_year, section | `has_perm('structure.read')` (stage-scoped sections by grade stage; teacher: `id = any(teacher_section_ids())` for section) | `has_perm('structure.write')` |
| student | `can_read_student(id)` | insert: `perm_scope('students.write') is null` (school-wide writers; scoped writers use `register_student`); update: `can_write_student(id)`; delete: `has_perm('students.delete')` (existing guard trigger kept) |
| enrollment | `can_read_student(student_id)` | `has_perm('students.write')` and the grade's stage ∈ `perm_scope('students.write')` (or school-wide) |
| account, fee_structure, fee_item, installment_schedule, reminder_rule | `has_perm('finance.read')` | `has_perm('finance.write')` |
| installment, money_event, payment_allocation, receipt_counter, discount, audit_entry, sms_message_log, sms_credit_topup (tenant read), sms_credit_consumption | `has_perm('finance.read')` | none directly (definer money functions only, unchanged) |
| notification | own rows, and money types only with `has_perm('finance.read')` | own mark-read (unchanged) |
| storage `money-attachments` | `has_perm('finance.read')` | `has_perm('finance.write')` |
| storage `school-logos` | unchanged read | `has_perm('settings.manage')` |
| storage `student-photos` (new, **private**) | object path `<school_id>/<student_id>/<file>`: `can_read_student(<student_id>)` or `<student_id>` in the caller's teacher roster scope. Served only as 5-minute signed URLs (FR-008a). | `can_write_student(<student_id>)` |
| stage, grade | `true` (reference data) | none |

For accountant, admin and viewer every condition evaluates to the same rows as today (US2).
The matrix test proves it.

---

## 11. Validation rules from the requirements

| Rule | Where enforced |
|---|---|
| ≥1 role while active; losing the last role = no access (edge case) | `current_school_id()` returns NULL with zero assignments; `set_user_roles` refuses an empty set for an active user (`ROLES_REQUIRED`; use deactivate instead) |
| Portal and staff roles not combined (FR-004) | `role_assignment_guard` trigger |
| Stage scope only for principal/student_affairs (FR-018a) | `role_assignment_stage` trigger |
| Never-grantable (FR-011) | FK to the optional catalogue + catalogue invariant trigger + audit test |
| Last active school admin (FR-027) | advisory-locked check in `set_user_roles` / `deactivate_user` |
| No self change (FR-027) | every user-management function |
| Invite expiry 7 days, single use, revocable (FR-026) | `invitation` state machine + `accept_invitation` row lock |
| Writes gated, revocations always allowed (FR-023) | `assert_writes_allowed` called only on grant paths |
| Email belongs to one school (FR-004) | `create_invitation` refuses if the email exists in `auth.users` linked to any `public.user` (`EMAIL_IN_USE`) |
| Request params never decide scope (FR-015) | helpers read only `auth.uid()`-derived state; RPC `p_school_id` args are compared to `current_school_id()` (existing pattern) |

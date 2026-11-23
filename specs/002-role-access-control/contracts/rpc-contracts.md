# Contract: Database RPCs (access control and user management)

All functions are `SECURITY DEFINER SET search_path = public`. EXECUTE is revoked from
`public, anon`. Each one checks the caller's permission itself (FR-021). Inputs are validated
with Zod at the web boundary (Article XI). The schemas live in `@erp/shared/schemas/access.ts`.
Errors use the vocabulary in [access-matrix.md §4](./access-matrix.md). Every mutating function
writes exactly one `access_audit_entry` per logical change, **in the same transaction**.

Common Zod primitives:

```ts
const Uuid = z.string().uuid();
const StaffRole = z.enum(['school_admin','principal','student_affairs','teacher','accountant','viewer']);
const StageScope = z.object({
  principal: z.array(Uuid).optional(),        // omitted/empty = school-wide
  student_affairs: z.array(Uuid).optional(),
}).strict();
const OptionalPermissionKey = z.enum([
  'students.guardian_contact','announcements.publish_own','students.fee_indicator',
  'sms.send_manual','finance.read','structure.write','finance.export',
]);
```

---

## A. Caller context (read)

### `my_access() → jsonb`  (EXECUTE: authenticated)
Returns the caller's resolved context. This is the only source the screens use to show or
hide things.
```ts
const MyAccess = z.object({
  user_id: Uuid,
  school_id: Uuid.nullable(),        // null if inactive, super_admin, or no roles
  status: z.enum(['invited','active','deactivated']),
  roles: z.array(z.string()),
  is_staff: z.boolean(),             // ≥1 staff role (login gate FR-029)
  is_super_admin: z.boolean(),
  permissions: z.array(z.string()),  // effective keys (enforced + not-yet-enforced)
  stage_scope: z.record(z.string(), z.array(Uuid).nullable()), // key → null (school-wide) | stage ids
});
```

### `teacher_roster(p_section_id uuid default null) → table(...)`  (authenticated)
Requires `students.read_limited`. Returns only rows in `teacher_section_ids()`, which is
empty until feature 02.
Columns: `student_id, name, photo_path, grade_id, grade_label, section_id, section_name,
enrollment_status, guardian_name, guardian_phone`. The last two are NULL unless
`students.guardian_contact` is on.

### `list_school_users() → table(...)`  (authenticated)
Requires `users.read`. Columns: `user_id, display_name, email, status, roles user_role[],
stage_scope jsonb, is_portal boolean, created_at, deactivated_at`. Pending invitations are
returned by `list_invitations()` (same permission; `token_hash` is never returned).

### `list_access_audit(p_user_id uuid default null, p_action access_audit_action default null, p_from timestamptz default null, p_to timestamptz default null, p_limit int default 100, p_before_id bigint default null) → table(...)`
Requires `users.read`. Keyset-paginated, newest first. Columns: `id, occurred_at, actor_id,
actor_name, target_user_id, target_name, target_email, action, before, after`. The web export
(CSV, Arabic headers, Africa/Khartoum times) pages through it (FR-033).

### `optional_permission_matrix() → table(role, permission_key, label_ar, default_enabled, enabled, changed_by, changed_at)`
Requires `users.read`. This is the data for the permissions screen.

---

## B. User management (write)

Common checks for all functions in this section, in this order:
1. `assert_perm('users.manage')`.
2. If there is a target user: it is in `current_school_id()` (else `NOT_FOUND`) and it is not
   `auth.uid()` (else `SELF_CHANGE_FORBIDDEN`).
3. `pg_advisory_xact_lock(hashtextextended(school_id::text, 0))`.
4. Grants call `assert_writes_allowed(school_id)`. Revocations do not (FR-023).

### `create_invitation(p_email citext, p_roles user_role[], p_stage_scope jsonb default '{}') → uuid`
Grant path (write-gated). Validates staff roles only, the stage scope only for
principal/student_affairs, no pending duplicate, and `EMAIL_IN_USE`. It inserts a `pending`
invitation with a 7-day expiry. Audit: `invitation_sent` (after: roles, stage_scope, email).
```ts
const CreateInvitationInput = z.object({
  email: z.string().email().max(254).transform((s) => s.toLowerCase()),
  roles: z.array(StaffRole).min(1),
  stage_scope: StageScope.default({}),
});
```

### `issue_invitation_token(p_invitation_id uuid) → text`
Grant path. The invitation must be `pending` and unexpired. It generates 32 random bytes
(`gen_random_bytes`), stores `digest(raw,'sha256')` and returns the raw token **once**
(base64url). Calling it again rotates the token (resend). It is called only by the worker,
**with the admin's own JWT**.

### `revoke_invitation(p_invitation_id uuid) → void`
Revocation path (allowed in every state). `pending → revoked`. Audit `invitation_revoked`.
The worker then deletes the orphan auth user, if one exists.

### `accept_invitation(p_token_hash bytea, p_display_name text, p_auth_user_id uuid) → jsonb`
**EXECUTE: service_role only** (called by the worker). It locks the invitation row and checks
`pending`, `now() < expires_at` and the hash match. Otherwise it raises `INVITATION_INVALID`
for every case. It inserts `public.user(status 'active', role = primary)`, the
`role_assignment` rows and the stage rows, and sets `accepted`. Audit `invitation_accepted`
(actor = the new user; after = roles, stage_scope). Returns `{ user_id, school_id, roles }`.

Re-check at acceptance time: if the school is no longer `active`, the invite **still
completes**. The grant was made, gated and audited when it was sent, and blocking a pending
acceptance would strand the invitee. The admin can revoke the invitation if needed.

### `set_user_roles(p_user_id uuid, p_roles user_role[], p_stage_scope jsonb default '{}') → void`
It compares the current and requested state:
- roles added, or stage scope widened (adding stages, or going from scoped to school-wide):
  **grant**, write-gated;
- roles removed, or stage scope narrowed: **revocation**, always allowed.

A mixed change in grace/locked state is refused as a whole with `WRITES_GATED`, so the admin
makes the revocation part as a separate call. Other refusals: removing `school_admin` from
the last active admin (`LAST_ADMIN_PROTECTED`), an empty set (`ROLES_REQUIRED`), mixing portal
and staff roles (`PORTAL_STAFF_MIX`), stages on other roles (`STAGE_SCOPE_NOT_ALLOWED`). Users
whose only roles are portal roles are refused here (`NOT_FOUND`; they are managed in feature 08).
Audit: one `role_added` / `role_removed` per role, and one `stage_scope_changed` per role whose
stages changed (before/after stage ids).

### `deactivate_user(p_user_id uuid) → void`
Revocation path (always allowed). Refuses the last active admin (`LAST_ADMIN_PROTECTED`). It
sets `status = 'deactivated'`, `deactivated_at`, `deactivated_by`, and the next request fails
(FR-028). Assignments are **kept**, so reactivation restores them and the audit history reads
naturally. Audit `user_deactivated`.

### `reactivate_user(p_user_id uuid) → void`
Grant path (write-gated). `deactivated → active`. Audit `user_reactivated` (after: roles).

### `set_optional_permission(p_role user_role, p_key text, p_enabled boolean) → void`
`(p_role, p_key)` must exist in `optional_permission` (else `NOT_GRANTABLE`; the FK makes this
structural anyway). Turning a switch on is a grant (write-gated). Turning it off is a
revocation (always allowed). It upserts `school_role_permission`. Audit
`optional_permission_changed` (before/after: `{role, key, enabled}`, target_user_id NULL).
```ts
const SetOptionalPermissionInput = z.object({
  role: z.enum(['teacher','student_affairs','principal','viewer']),
  key: OptionalPermissionKey,
  enabled: z.boolean(),
});
```

### `expire_invitations() → int`
**service_role only** (worker daily cron). `pending` rows past `expires_at` become `expired`.
Audit `invitation_expired` (actor NULL). Returns the count.

---

## C. Student writes for stage-scoped staff

### `register_student(p_student jsonb, p_enrollment jsonb) → uuid`
Requires `students.write`. If the caller's scope is stage-limited, the enrollment grade's
stage must be in scope (else `FORBIDDEN_PERMISSION`). It inserts `student` and `enrollment` in
one transaction, and the existing `enrollment_generate_installments` trigger generates the
installments exactly as today (FR-022). Write gating matches the existing spine writes. In
Phase 1, direct `student`/`enrollment` inserts are gated by the screen lifecycle gate
(`lib/auth/lifecycle-gate.ts`), not by a DB call (migration 0019 audits only the money RPCs).
`register_student` adds `assert_writes_allowed`, which is stricter and safe because it is a
new path. Phase 1 table writes are left as they are (US2). It returns `student_id` only.
**No installment data is returned.**

`p_student` / `p_enrollment` reuse the existing `UpsertStudentInput` / `EnrollStudentInput`
Zod schemas from `@erp/shared/schemas/spine.ts`.

---

## D. Other gates

### `authorize_manual_sms(p_student_id uuid) → void`
Requires `sms.send_manual`, and the student must be in scope (`can_read_student`). The worker
calls it **as the requesting user** before the unchanged dispatch + `consume_sms_credit` path.

---

## E. Changes to existing Phase 1 functions (signatures unchanged)

Each gets a permission check as its first statement after the existing school check. The
callers and the outputs seen by school_admin/accountant/viewer are unchanged (US2). **These
are money migrations: owner review, then the Gauntlet re-run (reconciliation, receipt
concurrency, idempotency, write gating).**

| Function | Added check |
|---|---|
| `apply_fee_payment`, `record_expense`, `record_transfer`, `record_refund`, `record_adjustment`, `apply_discount`, `reverse_event`, `record_opening_balance` | `assert_perm('finance.write')` |
| `student_statement`, `student_payments`, `receivables_aging`, `account_balance`, `installment_running_balance`, `student_balance` | `assert_perm('finance.read')` |
| `student_financial_summary`, `student_installments` | `finance.read`, **or** (`portal.linked` and `p_student_id = any(portal_student_ids())`) |
| `dashboard_kpis` | `finance.read` → full payload; else `finance.totals` → totals subset (access-matrix §3); else `FORBIDDEN_PERMISSION` |
| `student_directory` | `students.read` + stage scope filter; finance columns masked (research R5) |
| `generate_installments` (trigger) | unchanged; it runs as definer from the enrollment insert, which is already gated by enrollment RLS |
| `emit_notification` callers (`emit_notifications.sql`) | recipients come from `role_assignment` holders of `finance.read` instead of `user.role in (...)`; same people for Phase 1 schools |
| `current_school_id()` | redefined as status- and assignment-aware (data-model §9) |

`has_perm` returns true for a `service_role` JWT, so worker calls (reminder cron, dispatch)
behave exactly as today.

---

## F. Policy audit

### `audit_access_policies() → table(object text, kind text, detail text)`
**service_role only.** It returns one row per violation of research R11. The test asserts
zero rows. `kind` ∈ `rls_disabled`, `rls_not_forced`, `no_policy`, `signed_in_only_policy`,
`role_column_authz`, `unreviewed_definer`, `catalogue_never_grantable`.

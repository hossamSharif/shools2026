# @erp/database

Supabase migrations, money functions, RLS policies, seeds, and MCP-generated types.

## Migration workflow (Article XII — Supabase MCP)

All schema changes ship as **forward-only** SQL migrations applied via the Supabase MCP
`apply_migration` tool — never ad-hoc SQL clients. The `.sql` files in `migrations/` and
`functions/` are the reviewable source of record; each is applied by name to the live project.

1. Author the migration `.sql` under `migrations/NNNN_name.sql` (or a function under
   `functions/`).
2. **Owner-review gate**: if the migration touches any of —
   - money tables (`money_event`, `installment`, `payment_allocation`, `receipt_counter`,
     `sms_credit_*`, `discount`, `audit_entry`, `account`, `subscription`, …),
   - money functions (`apply_fee_payment`, `record_*`, `apply_discount`, `*_sms_credit`,
     `reverse_event`, write-gating),
   - the receipt-number counter, or
   - RLS policies / GRANTs
   — it is **flagged for owner review before `apply_migration`**. Do not apply without approval.
3. Apply via `apply_migration({ project_id, name, query })`.
4. After schema changes, regenerate types with `generate_typescript_types` into
   `src/types/database.ts` (never hand-edit).

## Layout

```
migrations/   forward-only SQL, applied via Supabase MCP apply_migration
  _templates/ reusable policy templates (not applied directly)
functions/    SQL source for money functions + helpers
seeds/        fixed reference data (stages/grades, default reminder rules)
src/types/    generate_typescript_types output (single source of truth — Article XI)
src/functions/ Vitest integration tests for the money functions (Article X)
```

## Tenant-isolation checklist (Article IV) — every new tenant table

- Carries a `school_id` column.
- Enables RLS with a **default-deny** posture (no policy ⇒ no access).
- Adds an explicit same-school `USING` / `WITH CHECK` policy keyed to `current_school_id()`.
- Grants the minimal privileges to the `authenticated` role.
- Financial tables additionally **exclude super-admin** reads.

See `migrations/_templates/tenant_rls.sql` for the reusable pattern.

## Access model (feature 002 — roles and permissions)

Access is decided in Postgres. The web and the worker only mirror it for UX, and every
exposed function and policy refuses on its own.

- **Roles and assignments.** A user holds one or more roles in `role_assignment`. The stage
  scope for principal and student affairs lives in `role_assignment_stage`. `user.role` stays
  as a denormalised "primary role" for Phase 1 code.
- **Permission catalogue.** The catalogue is product-fixed:
  - `permission` holds the keys;
  - `role_permission_default` holds the defaults per role;
  - `optional_permission` holds the switches a school may change;
  - `school_role_permission` holds each school's switch values.

  The composite FK makes any other (role, key) pair unstorable. The source of truth for the
  keys is `@erp/shared/access` (`keys.ts`), and `catalogue.test.ts` fails if the seed and the
  TypeScript drift.
- **Helpers (0037).** Every policy and exposed function uses these helpers:
  - `has_perm(key)` and `assert_perm(key)`;
  - `perm_scope(key)`: NULL means school-wide, `'{}'` means none or relationship-only;
  - `can_read_student` and `can_write_student`;
  - `portal_student_ids()` and `teacher_section_ids()`;
  - `my_access()`, which gives the web its roles, permissions and scope.

  They read the tables on every statement, so a role, status or switch change applies to
  open sessions on their next request.
- **Privileged functions.** SECURITY DEFINER functions reachable by `authenticated` must be on
  `reviewed_definer_functions()`. Extend that list with `create or replace` in the same
  migration that adds a function. `audit_access_policies()` reports any unlisted one.

### Migrations 0033–0047

| Migration | What it does |
|---|---|
| 0033 | New staff roles (principal, student_affairs, teacher) and reserved portal roles (guardian, student) |
| 0034 | `role_assignment` (+ stage scope), `user.status`, sync triggers for `user.role` |
| 0035 | Permission catalogue, role defaults, optional switches, per-school switch values |
| 0036 | `portal_link` (guardian/student ↔ student), service-role writes only |
| 0037 / 0037a | Access helpers; scoped `app.access_sync` flag |
| 0038 | Every tenant policy rewritten to require a permission key or a relationship helper |
| 0039 | Money and derived functions check permissions; `*_unchecked` internal copies |
| 0040 | Notification recipients by permission |
| 0041 | `audit_access_policies()` and the reviewed definer allow-list |
| 0042 | `authorize_manual_sms` gate for the worker |
| 0043 | `invitation` and the immutable `access_audit_entry` |
| 0044 | User management: invitations, roles, stages, deactivate/reactivate |
| 0045 | `teacher_roster`, `register_student`, the private `student-photos` bucket; `student_directory` fee indicator and money sorts |
| 0046 | `optional_permission_matrix`, `set_optional_permission` |
| 0047 | `list_access_audit`; merged SELECT policies and FK indexes (advisor follow-up) |

### Adding a new tenant table

1. Copy `migrations/_templates/tenant_rls.sql` into the table's migration and replace
   `{{TABLE}}`, `{{READ_KEY}}` and `{{WRITE_KEY}}`. A policy whose only condition is
   `school_id = current_school_id()` is forbidden (`signed_in_only_policy`).
2. If the table needs new permission keys, add them to the catalogue in a new migration (rows
   in `permission` and `role_permission_default`, like the 0035 seed), and to
   `packages/shared/src/access/keys.ts`.
3. Add the table to `DATA_SETS` and its expected access per fixture user to
   `ACCESS_EXPECTATIONS` in `packages/shared/src/access/matrix.ts`. The matrix test then probes
   it for all roles.
4. Run the gates below before asking for owner review.

### Extension seams

- **Feature 02 (teaching allocations):** replace the body of `teacher_section_ids()` (0037;
  it returns `'{}'` today). `teacher_roster()`, `teacher_can_see_student()` and the photo
  policies then follow with no other change.
- **Feature 08 (portal):** add the link and login flows on top of `portal_link`. Reads are
  already scoped through `portal_student_ids()`, and `portal.test.ts` proves them. Today the
  staff login signs portal users out (`/login?e=portal`).

### Required gates (FR-035, SC-002)

`src/access/*.test.ts` (including `policy-audit.test.ts` and the read/write `matrix.test.ts`)
must pass on every change that touches a migration, a policy or an exposed function. Run them
with:

```
pnpm test:access          # turbo → @erp/database test:access (never cached)
```

The suites skip themselves when `SUPABASE_URL`, `SUPABASE_ANON_KEY` or
`SUPABASE_SERVICE_ROLE_KEY` is missing. In CI, set `REQUIRE_INTEGRATION_ENV=1`: a missing
variable then fails the run instead of skipping the gates
(`src/test-helpers/require-integration.ts`). Point the variables at a test project or a branch
database, never at a school's production data. The tests create and remove their own schools
and users.

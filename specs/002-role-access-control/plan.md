# Implementation Plan: Role-Aware Access Control and New Staff Roles

**Branch**: `ccr-d2ea954a-1u31qc` (spec authored on `ccr-87495f0c-fwh9el`; spec directory `002-role-access-control`) | **Date**: 2026-11-23 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-role-access-control/spec.md`

## Summary

Replace Phase 1's "any signed-in user of the school sees every row of the school" with
**per-role, per-relationship enforcement in Postgres**. This comes before any teacher,
student-affairs, guardian or student account exists. The feature adds the `principal`,
`student_affairs` and `teacher` staff roles and reserves the `guardian` and `student` portal
roles. It adds multi-role users (union of rights), optional stage scope, a product-fixed
access matrix with a small per-school optional-permission catalogue, school-side user
management with 7-day invitations, and an immutable access audit. Phase 1 finance behaviour
for school_admin, accountant, viewer and the super-admin does not change.

**Technical approach.** Rights are **permission keys** stored in product-owned catalogue
tables. A user's effective keys are resolved **on every statement** by `STABLE SECURITY
DEFINER` helpers (`has_perm`, `perm_scope`, `can_read_student`, …). They read `user.status`,
the new `role_assignment` rows, the school's optional switches and relationships
(`teacher_section_ids()`, a stub until feature 02; `portal_link`, a minimal table for feature
08). Every Phase 1 tenant policy is rewritten to require a key. Every exposed derived or money
function gets the same check. Per-role column limits come from definer functions
(`teacher_roster`, masked `student_directory`, totals-only `dashboard_kpis`). The never-grantable set is
**structural**: per-school switches have a foreign key to the optional catalogue, so a
forbidden grant cannot be stored. `current_school_id()` becomes status-aware, so deactivation
and revocation apply on the next request without a session-kill mechanism. User management
is done only through audited definer functions with an advisory lock that protects the last
admin. Invitations use app-owned hashed tokens delivered through Supabase Auth's invite mail by
the worker (the only holder of the service key). A service-role-only `audit_access_policies()`
and a table-driven direct-query matrix test enforce FR-034/035 on every change. The Phase 1
Playwright suite and the Gauntlet run unchanged.

Research also found a **real Phase 1 gap**: the money RPCs check school but not role, so a
viewer can post a payment through the API today. Closing it is part of FR-021, and the
matrix test covers it (research R0).

## Technical Context

**Language/Version**: TypeScript 5.x (strict), Node.js 20, React 18; SQL/PL/pgSQL on Supabase Postgres 15.
**Primary Dependencies**: unchanged from Phase 1. Next.js 14 App Router, `@supabase/supabase-js` + `@supabase/ssr`, TanStack Query/Table, react-hook-form + Zod, Radix/shadcn, Tailwind, next-intl (Arabic/RTL), date-fns-tz; Express 4 worker (helmet, cors, express-rate-limit). Postgres extensions `pgcrypto` (`gen_random_bytes`, `digest`) and `citext`. **No new runtime dependencies.**
**Storage**: Supabase Postgres. New tables `role_assignment`, `role_assignment_stage`, `permission`, `role_permission_default`, `optional_permission`, `school_role_permission`, `portal_link`, `invitation`, `access_audit_entry`; `public.user` gains `status` (see [data-model.md](./data-model.md)). Supabase Auth for identities and invite mail.
**Testing**: Vitest integration tests against a real Supabase (direct-query matrix, revocation, user-management rules, audit immutability, policy audit). Playwright for every UI flow (Article XIII). Existing Phase 1 suites run unchanged.
**Target Platform**: Web/PWA on Vercel; worker on Fly.io; managed Supabase.
**Project Type**: Web application, the existing `@erp/*` pnpm/Turborepo monorepo.
**Performance Goals**: accountant daily tasks no slower than before (SC-008). p95 regression ≤10% on statement/aging/dashboard/directory at 2,000 students. Permission helpers evaluated once per statement (init-plan).
**Constraints**: data-layer enforcement only (FR-019/020); revocation effective on the next request (FR-028); zero behaviour change for Phase 1 roles (US2, FR-036); writes gated in grace/locked, revocations always allowed (FR-023); Arabic RTL, Africa/Khartoum (FR-030); forward-only migrations with owner review (Article XII).
**Scale/Scope**: ~100 schools, ≤2,000 students and ≤150 staff per school; 9 roles; ~20 enforced permission keys plus not-yet-enforced module keys; 7 optional switches; ~22 existing tenant data sets and ~14 derived functions brought under the matrix.

_No open NEEDS CLARIFICATION. All unknowns are resolved in [research.md](./research.md) R0–R14.
One spec note is carried to `/speckit-analyze` (research R4: the accountant's real Phase 1
student/structure write rights versus the "view (as today)" shorthand in FR-007; the plan
follows FR-003)._

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design (below).*

| Article | Requirement | How the plan satisfies it | Status |
|---|---|---|---|
| I — Financial Integrity | Money changes only in single-txn DB functions; NUMERIC; gapless receipts; idempotency | No money rows are written by this feature (FR-022). Money RPCs gain only a leading `assert_perm('finance.write')`, and their transaction bodies are untouched. Student-affairs enrollment uses the existing enrollment trigger path. | PASS |
| II — Derived Balances | Never store balances | No balance storage. Masking happens at output (`student_directory`, `dashboard_kpis`); computation is unchanged. | PASS |
| III — Append-only Ledger | Immutable financial rows | Ledger is untouched. `access_audit_entry` follows the same rule (no update/delete; immutability trigger). | PASS |
| IV — Tenant Isolation in DB | default-deny RLS + `school_id` + GRANTs; super-admin wall-off; new-table checklist | This feature *strengthens* Article IV: every tenant policy now needs an explicit permission key, and the policy audit enforces the new-table checklist on every change. Super-admin has no key and no policy on finance or access-audit tables. Every new table: `school_id` (tenant ones), FORCE RLS, explicit GRANTs, no direct writes for `authenticated`. | PASS |
| V — Immutable Audit Trail | Who/what/when, immutable | `access_audit_entry` covers every invitation, role, stage, status and switch change (FR-031). It is written in the same txn, exactly one per change, and immutable for every role including service_role. | PASS |
| VI — Service Boundaries | Money logic in Postgres; Next.js = UI/light CRUD; worker = long-running; SMS behind interface | All authorization and user-management logic is in Postgres. Next.js only calls RPCs and hides UI. The worker gains invitation send/accept endpoints because it is already the only holder of the service key. It decides nothing itself (see Complexity Tracking). The SMS path is unchanged apart from an authorization pre-check. | PASS (justified extension) |
| VII — Credit & Messaging Integrity | Atomic send+decrement, segment count, logged | Unchanged. `authorize_manual_sms` runs before dispatch. The SMS log becomes finance-tier read. | PASS |
| VIII — Africa/Khartoum | UTC store, Khartoum render | All new timestamps are `timestamptz`. The audit screen and export render in Africa/Khartoum. Invite expiry is absolute (7×24h), which does not depend on the timezone. | PASS |
| IX — Arabic-RTL & SDG | Arabic RTL everywhere | New screens, emails (invite template), errors and the forbidden page are Arabic RTL. Role and stage labels are in Arabic. | PASS |
| X — The Gauntlet | Live verification; reconciliation; receipt concurrency; forward-only | Money functions are touched, so the full Gauntlet re-runs unchanged (quickstart §4.6). New direct-query matrix and revocation tests run on a real Supabase. Playwright covers the new flows. Migrations are forward-only. | PASS |
| XI — Type Safety & Validation | strict TS; Zod at boundaries; shared types SoT | Zod schemas for every new RPC and worker body are in `@erp/shared/schemas/access.ts`. `ACCESS_EXPECTATIONS` and the permission keys live in `@erp/shared/access`. DB types are regenerated through MCP. | PASS |
| XII — Supabase MCP for DB | MCP-only DB work; owner review of RLS/money migrations | All 11 migrations go through `apply_migration`. **Every one is flagged for owner review** (all touch RLS and 0041 touches money functions). Types come from `generate_typescript_types`, plus `get_advisors` checks. | PASS (review gate applies) |
| XIII — Playwright | Only browser tool; RTL assertions | New specs (invite/deactivate, switches, audit, portal login refusal) use Playwright with RTL assertions. The existing suite runs unchanged. | PASS |

**Security & Secrets**: no new secrets. `APP_URL` is config, not a secret. The service key
stays in the worker. Invitation tokens are stored only as SHA-256 hashes and returned once.
**Git discipline**: commit per completed task on the active branch; halt if a commit cannot be made.

**Result (pre-research): PASS.** One justified scope extension (Article VI, worker endpoints) is recorded below.

**Re-check after Phase 1 design: PASS.** The design artifacts introduce no new violation. The data
model meets the Article IV checklist for all 9 new tables. Contracts keep money mutation in
existing functions. The policy audit (FR-035) turns Article IV into a CI gate.

## Project Structure

### Documentation (this feature)

```text
specs/002-role-access-control/
├── plan.md              # This file (/speckit-plan output)
├── research.md          # Phase 0: R0 baseline + R1–R14 decisions
├── data-model.md        # Phase 1: tables, helpers, policy rewrite, validation rules
├── quickstart.md        # Phase 1: migrations, config, fixture, verification
├── contracts/
│   ├── access-matrix.md      # permission keys × roles × data sets; error vocabulary
│   ├── rpc-contracts.md      # new + changed DB functions with Zod inputs
│   ├── worker-endpoints.md   # invitation send/accept, manual SMS auth, cron
│   └── web-routes.md         # guards, routes, nav mapping
├── checklists/
│   └── requirements.md  # (pre-existing)
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
packages/
├── shared/src/
│   ├── access/                    # NEW: permission keys, role groups, ACCESS_EXPECTATIONS (matrix as data)
│   │   ├── keys.ts
│   │   ├── matrix.ts
│   │   └── index.ts
│   └── schemas/access.ts          # NEW: Zod for invitation, roles, stage scope, switches, accept, audit filters
│
├── database/
│   ├── migrations/
│   │   ├── 0033_user_role_values.sql
│   │   ├── 0034_role_model.sql
│   │   ├── 0035_permission_catalogue.sql
│   │   ├── 0036_access_helpers.sql
│   │   ├── 0037_portal_link.sql
│   │   ├── 0038_invitation_access_audit.sql
│   │   ├── 0039_user_management_functions.sql
│   │   ├── 0040_rewrite_tenant_policies.sql
│   │   ├── 0041_harden_derived_and_money_functions.sql
│   │   ├── 0042_notification_recipients.sql
│   │   ├── 0043_policy_audit_function.sql
│   │   └── _templates/tenant_rls.sql          # UPDATED: role-aware template (no signed-in-only policy)
│   ├── functions/                 # UPDATED sources for §E functions; NEW access_helpers.sql, user_management.sql
│   ├── seeds/test_access_fixture.sql          # NEW
│   └── src/
│       ├── access/                # NEW Vitest: matrix.test.ts, revocation.test.ts, user-management.test.ts,
│       │                          #   audit.test.ts, policy-audit.test.ts, catalogue.test.ts
│       ├── test-helpers/supabase.ts           # + createAuthedStaff(); createAuthedUser unchanged
│       └── types/database.ts      # regenerated via MCP
│
├── api/src/
│   ├── routes/invitations.ts      # NEW: /internal/invitations/:id/send, /invitations/accept
│   ├── routes/dispatch-manual.ts  # UPDATED: x-user-jwt + authorize_manual_sms
│   ├── cron/                      # UPDATED: expire_invitations + orphan auth-user cleanup
│   └── middleware/                # + user-jwt client helper
│
└── web/
    ├── lib/auth/guard.ts          # UPDATED: roles[], permissions, requireStaff, requirePermission
    ├── lib/actions/users.ts       # NEW: invite, resend, revoke, setRoles, (de)activate, setOptionalPermission
    ├── lib/actions/*.ts           # UPDATED guards per contracts/web-routes.md
    ├── lib/queries/users.ts       # NEW: list users/invites/audit/permission matrix
    ├── app/login/                 # UPDATED: staff-only gate (FR-029)
    ├── app/auth/accept-invite/    # NEW
    ├── app/forbidden/             # NEW
    ├── app/(school)/home/         # NEW
    ├── app/(school)/users/        # NEW: page, permissions/, audit/ (+ export route)
    ├── app/(school)/dashboard/    # UPDATED: totals-only rendering
    ├── components/app-shell.tsx   # UPDATED: nav by permission key
    ├── i18n/                      # + users, permissions, accessAudit, invite, forbidden, roles, errors.access
    └── tests/                     # NEW: us3-invite-teacher, us5-optional-permission, us6-access-audit, login-portal-refused
```

**Structure Decision**: Keep the existing five-package `@erp/*` monorepo with no new package.
Authorization and user management live in `@erp/database` (Postgres) as the single
authority. `@erp/shared` holds the permission vocabulary and the matrix-as-data that tests
and screens import. `@erp/web` adds screens and guards (defense in depth only). `@erp/api`
adds the service-key-dependent invitation endpoints and cron steps. Feature 02 extends the
system only by replacing the body of `teacher_section_ids()`; feature 08 does so only by
adding flows over `portal_link`.

## Phase outline

- **Phase 0 — Research** ✅ [research.md](./research.md): baseline audit of the Phase 1 build
  (R0), and decisions on enforcement locus, multi-role storage, the permission model,
  column limits, relationship seams, stage scope, revocation, invitations, safety rules,
  policy audit, testing, performance and screens.
- **Phase 1 — Design & contracts** ✅ [data-model.md](./data-model.md),
  [contracts/](./contracts/), [quickstart.md](./quickstart.md); agent context (`CLAUDE.md`)
  points to this plan.
- **Phase 2 — Tasks** (next: `/speckit-tasks`). Suggested order, from the story priorities and
  dependencies: (1) role model + catalogue + helpers + fixture + matrix test harness (they
  fail first); (2) policy rewrite + function hardening (US1/US2 P1), then the Gauntlet re-run;
  (3) user management + invitations + audit + screens (US3 P1, US6 P2); (4) new-role defaults
  and `register_student`/`teacher_roster` (US4 P2); (5) optional switches screen (US5 P2);
  (6) portal fixtures + matrix rows (US7 P3); (7) policy audit in CI, perf check.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Worker (`@erp/api`) gains invitation send/accept endpoints beyond cron/dispatch/webhook (Article VI scope extension, not a rule breach) | Creating auth users, setting passwords and sending invite mail need the Supabase service key, and the worker is already its only holder. Every authorization decision stays in Postgres (`issue_invitation_token` runs as the admin; `accept_invitation` validates the token under lock). | Putting the service key in Next.js on Vercel widens secret exposure. Supabase's built-in invite link alone cannot give a 7-day, single-use, revocable invitation (FR-026). A separate email provider adds infrastructure for no gain. |

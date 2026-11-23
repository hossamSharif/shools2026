# Contract: Web routes, guards and navigation (`@erp/web`)

Screens are defense in depth (FR-019). Every guard below mirrors a DB check that already
refuses on its own. All UI is Arabic RTL, with dates in Africa/Khartoum (FR-030, Articles VIII/IX).

## Guards (`lib/auth/guard.ts`)

```ts
export type UserRole =
  | 'super_admin' | 'school_admin' | 'principal' | 'student_affairs' | 'teacher'
  | 'accountant' | 'viewer' | 'guardian' | 'student';

export interface AuthContext {
  userId: string;
  role: UserRole;              // primary role (compat; display only)
  roles: UserRole[];
  permissions: ReadonlySet<string>;
  stageScope: Record<string, string[] | null>;
  schoolId: string | null;
  displayName: string;
  isStaff: boolean;
}

requireAuth(): Promise<AuthContext>           // + calls rpc('my_access') per request
requireRole(...roles): Promise<AuthContext>   // compat: holds ANY of roles, else redirect('/')
requireStaff(): Promise<AuthContext>          // isStaff && schoolId, else signOut + /login?e=portal|inactive
requirePermission(...keys): Promise<AuthContext> // ANY key, else redirect('/forbidden')
```

Phase 1 call sites keep working. As an extra step, each server action switches
`requireRole('school_admin','accountant')` to the equivalent `requirePermission(...)`
(table below). For Phase 1 roles the result is the same.

| Server action | Phase 1 guard | New guard |
|---|---|---|
| spine: createAcademicYear, setCurrentYear, createSection | admin, accountant | `structure.write` |
| spine: createAccount, createFeeStructure | admin, accountant | `finance.write` |
| spine: upsertStudent, setStudentStatus, enrollStudent | admin, accountant | `students.write` (stage-scoped callers → `register_student`) |
| spine: deleteStudent | admin | `students.delete` |
| reminders: rule edits | admin, accountant | `finance.write` |
| reminders: sendManualReminder | admin, accountant | `sms.send_manual` (+ forwards JWT) |
| money-events.* | admin, accountant | `finance.write` |
| payment-helpers | admin, accountant, viewer | `finance.read` |
| branding / school-logo | admin | `settings.manage` |
| exports: receivables | any signed-in | `finance.export` |
| exports: students | any signed-in | `students.export` |

## Routes

| Route | Guard | Notes |
|---|---|---|
| `/login` | public | after sign-in: `my_access()`. If `!is_staff`, sign out and show "بوابة أولياء الأمور والطلاب غير متاحة بعد" (FR-029). If deactivated, show "تم إيقاف حسابك". |
| `/auth/accept-invite?token=` | public | form: display name, password, confirm → worker `/invitations/accept` → sign in → `/` |
| `/forbidden` | `requireAuth` | Arabic "غير مصرّح لك بالوصول إلى هذه الصفحة" + link home (US3-2) |
| `/` | `requireAuth` | super_admin → `/schools`; `finance.totals` → `/dashboard`; else `/home` |
| `/home` | `requireStaff` | role landing page: greeting, roles, links to the modules the user can use |
| `(school)` layout | `requireStaff` | was `requireRole('school_admin','accountant','viewer')` |
| `/dashboard` | `finance.totals` | renders totals-only cards if no `finance.read` |
| `/students/**` | `students.read` | finance columns/filters hidden without `finance.read`; fee badge with `students.fee_indicator` |
| `/payments`, `/expenses`, `/transfers`, `/refunds`, `/adjustments` | `finance.write` | unchanged |
| `/reports/**`, `/sms` | `finance.read` | unchanged |
| `/notifications` | `requireStaff` | DB filters money notifications |
| `/settings/**` | `settings.read` (edit controls: `settings.manage`; years/sections: `structure.write`) | |
| `/users` | `users.read` (actions: `users.manage`) | list + invite dialog + per-user edit sheet (roles, stages, deactivate/reactivate) + pending invites (resend/revoke) |
| `/users/permissions` | `users.read` (toggles: `users.manage`) | optional switches per role; non-enforced module defaults shown read-only |
| `/users/audit` | `users.read` | filters: user, action, date range; CSV export (Arabic headers, Khartoum time) |

Write controls on `/users*` are disabled with the existing read-only banner in grace/locked
state, **except** deactivate, remove role, narrow stages and switch off, which stay enabled
(FR-023).

## Navigation (`components/app-shell.tsx`)

`NAV[].roles` is replaced by `NAV[].perm` (a permission key). An item shows when
`permissions.has(perm)` (and the existing `mutate` lifecycle rule).

| Item | perm |
|---|---|
| dashboard | `finance.totals` |
| home | shown when no `finance.totals` |
| students | `students.read` |
| payments, expenses | `finance.write` (mutate) |
| reports | `finance.read` |
| sms | `finance.read` |
| notifications | staff |
| settings | `settings.read` |
| users (new) | `users.read` |
| schools | super-admin (unchanged) |

For school_admin, accountant and viewer this produces exactly the Phase 1 nav lists. The
existing `responsive-nav.spec.ts` checks this without edits.

## i18n

New `next-intl` namespaces: `users`, `permissions`, `accessAudit`, `invite`, `forbidden`,
`roles` (Arabic labels for all 9 roles and 3 stages), `errors.access` (one message per code in
access-matrix §4).

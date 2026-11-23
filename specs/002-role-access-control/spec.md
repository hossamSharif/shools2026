# Feature Specification: Role-Aware Access Control and New Staff Roles

**Feature Branch**: `ccr-87495f0c-fwh9el` (spec directory `002-role-access-control`)
**Created**: 2026-11-23
**Status**: Draft
**Input**: User description: "Role-aware access control and new staff roles for ITLINK School — enforce per-role and per-relationship access at the data layer before teachers, student-affairs staff, guardians and students become users; add principal / student_affairs / teacher roles; reserve guardian / student portal roles; per-module access matrix with limited school-level overrides; user management and audit; zero change to existing finance behaviour."

## Context

Phase 1 (spec `001-fee-accounting`) gave every school four roles (super-admin, school admin, accountant, viewer), one role and one school per user. Data-layer rules today give **every signed-in user of a school access to all of that school's rows**. Role limits exist only in the app screens. That is safe today only because every school user is trusted finance staff.

This feature is the foundation for the rest of the platform phase. Later features add teachers, student affairs, guardians and students, and none of them may log in until access is enforced **in the data layer**, per role and per relationship. The rule this feature enforces is **"no access just for being signed in to the school"**.

Related features in this phase (referenced by number, specified separately):
- **02**: teacher ↔ section/subject allocation (the relationship teacher scoping depends on).
- **08**: guardian and student portal login (the login screens for the reserved portal roles).

## Clarifications

### Session 2026-11-23

- Q: Multi-role users — several roles per user, or one role plus extra permissions? → A: Several staff roles per user; effective rights are the union of the roles. Per-role optional switches (FR-010) still apply. There are no per-user extra permissions.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Data-layer enforcement replaces "any school user sees everything" (Priority: P1)

Every existing school data set (students, enrollments, sections, academic years, accounts, fee structures, installments, money events, receipts, discounts, statements, aging, dashboard figures, notifications, reminder rules, SMS log, SMS credit, audit entries, school settings and logo, users) is reachable only by the roles the access matrix allows, and only within the caller's relationships. This holds whether the caller uses the app screens or queries the data service directly with their own valid session.

**Why this priority**: Every other story depends on it, and so does every later feature that brings in non-finance users. Without it, the first teacher account could read the school's whole ledger through the API.

**Independent Test**: Seed one school with one user per role (including a teacher with no allocations and a reserved-role guardian/student test identity). For every existing tenant data set, query it directly as each user with that user's own session. Compare the rows returned (and writes accepted) with the matrix. No screen is involved.

**Acceptance Scenarios**:

1. **Given** an authenticated teacher of School A, **When** they query money-event rows of School A directly through the data API, **Then** zero rows are returned and no error reveals that such rows exist.
2. **Given** an authenticated teacher, **When** they call any finance-derived read (student statement, receivables aging, dashboard money figures, account balances, student balance or financial status), **Then** they get no data (empty result or a refusal), never another student's or the school's money figures.
3. **Given** an authenticated student-affairs user, **When** they read the student directory, **Then** they see student identity, enrollment and status fields but no balance, amount owed, payment status, installment or receipt data.
4. **Given** a teacher with no allocations (feature 02 not yet in use), **When** they query students, sections, enrollments or any academic data, **Then** they get zero rows.
5. **Given** any authenticated user of School A, **When** they query any data set of School B, **Then** they get zero rows (existing tenant isolation is kept).
6. **Given** any data-layer rule, **When** rules are reviewed by the automated policy audit, **Then** no rule grants access based only on "authenticated and same school" without a role/permission condition.

---

### User Story 2 - Existing finance users notice no change (Priority: P1)

School admins, accountants and viewers keep exactly their Phase 1 behaviour: the same screens, the same data, the same actions, the same write-gating in grace and locked states. The super-admin still manages tenants, subscriptions and SMS credit and still cannot read any school's financial records.

**Why this priority**: Finance is the system of record and is already in production use. A regression here would stop schools from collecting fees.

**Independent Test**: Run the full existing Playwright suite and Gauntlet checks unchanged against the new access model. All must pass with no edits to their assertions.

**Acceptance Scenarios**:

1. **Given** an existing accountant, **When** they record a payment, expense, transfer, refund or adjustment, print a receipt, view statements and aging, or send a manual reminder, **Then** each works exactly as before, with the same receipt numbering, balances and SMS credit behaviour.
2. **Given** an existing viewer, **When** they open reports and statements, **Then** they see the same read-only data as before and still cannot record any money event.
3. **Given** the super-admin, **When** they query any school's money events, installments, statements, balances, SMS log or audit entries, **Then** zero rows are returned (wall-off unchanged).
4. **Given** the migration to the new role model, **When** it completes, **Then** every existing user keeps their exact role and school with no action from the school.

---

### User Story 3 - School admin invites and manages staff (Priority: P1)

A school admin opens a users page for their school. They invite a staff member by email and assign one or more staff roles. Later they can change the roles, deactivate the user or reactivate them. The invited person sets a password and logs in, and sees only the navigation and data their roles allow.

**Why this priority**: This is how teachers, principals and student-affairs staff get accounts. Today no school-side user management exists.

**Independent Test**: As school admin, invite a teacher, accept the invite as that teacher, log in, and confirm that finance pages are not offered, finance URLs opened directly are refused, and finance data queries return nothing. Then deactivate the teacher and confirm they can no longer sign in or use an existing session.

**Acceptance Scenarios**:

1. **Given** a school admin in an active subscription, **When** they invite `teacher@example.com` with the teacher role, **Then** an invitation is sent, the user appears as "invited", and the invite expires after 7 days if unused.
2. **Given** an invited teacher who accepted, **When** they log in, **Then** they land on a teacher-appropriate home page, finance menu items are absent, and navigating directly to a finance page shows a "not permitted" page in Arabic.
3. **Given** an active user, **When** the school admin deactivates them, **Then** within 5 minutes the user can no longer read or write any school data, even with a session that was already open.
4. **Given** the school has exactly one active school admin, **When** anyone tries to deactivate that admin or remove their school-admin role, **Then** the action is refused with an explanation (a school is never left without an admin).
5. **Given** any user, **When** they try to change their own roles or permissions, **Then** the action is refused.
6. **Given** an accountant, viewer, teacher, student-affairs user or principal, **When** they try to invite, change roles of, or deactivate any user, **Then** the action is refused at the data layer.

---

### User Story 4 - New staff roles work within their default permissions (Priority: P2)

A principal, a student-affairs officer and a teacher each sign in and can do exactly what the product's default access matrix gives their role: the principal oversees academics and approves and publishes; student affairs manages student records and enrollment through the existing enrollment path; a teacher works only on their allocated sections and subjects.

**Why this priority**: These are the staff who will use the academic modules in later features. Their boundaries must exist (and be tested) before those modules ship, but the modules themselves come later.

**Independent Test**: Seed one user per new role and run the matrix test for each role against all existing data sets. Then run a write test for each permitted action: student affairs enrolls a student (installments are generated by the existing path), and a teacher is refused when trying to edit a student record.

**Acceptance Scenarios**:

1. **Given** a student-affairs user, **When** they register a student and enroll them in a grade and section, **Then** the enrollment goes through the existing enrollment path, fee installments are generated as for any enrollment, and the student-affairs user still cannot see the installment amounts.
2. **Given** a student-affairs user, **When** they try to record any money event, apply a discount, or edit a fee structure, **Then** the action is refused.
3. **Given** a teacher, **When** they try to create, edit or delete a student, section, enrollment or academic year, **Then** the action is refused.
4. **Given** a principal, **When** they open student and enrollment data, **Then** they can view all students of the school. Finance visibility follows the principal decision recorded in FR-012.
5. **Given** a user who holds both the teacher and student-affairs roles, **When** they act, **Then** they can do whatever either role allows and nothing that neither allows. For example, they can edit student records (student affairs) but still cannot read any finance data.

---

### User Story 5 - School admin adjusts optional permissions per role (Priority: P2)

The school admin opens a permissions screen that shows the product's default matrix for each role. They can switch a small, product-defined set of **optional permissions** on or off for a role within their school, for example letting teachers see the guardian phone number of students in their allocated sections. They cannot change anything outside that set.

**Why this priority**: Schools differ in how much they trust each staff role. Without a small, safe override set, schools will ask for extra roles or share admin logins.

**Independent Test**: Toggle one optional permission for the teacher role, confirm a teacher's direct data query changes to match, and confirm the change appears in the audit log. Try to grant a non-grantable permission (for example finance read to teachers) and confirm it is refused even when sent directly to the data API.

**Acceptance Scenarios**:

1. **Given** the default matrix, **When** the school admin turns on "teacher may view guardian contact for allocated students", **Then** teachers of that school (and only that school) can read guardian name and phone for students in their allocated sections, and nothing beyond that.
2. **Given** any attempt to grant a permission not in the optional catalogue (for example finance view to teacher, student affairs, guardian or student, or user management to anyone except school admin), **Then** it is refused at the data layer.
3. **Given** an optional permission is revoked, **When** an affected user next reads data, **Then** the revocation takes effect within 5 minutes.

---

### User Story 6 - Audit of role and permission changes (Priority: P2)

Every invitation, role assignment, role removal, deactivation, reactivation and optional-permission change is recorded with who did it, to whom, what changed (before and after) and when. The record cannot be edited or deleted. A school admin can browse and export this log for their school.

**Why this priority**: Access changes are the main fraud and abuse vector once non-finance staff exist, for example someone granting themselves finance access, using it, then revoking it.

**Independent Test**: Perform each kind of change once, then confirm that one audit record exists for each, with correct actor, target, before/after values and Africa/Khartoum timestamps, and that edit or delete attempts on audit records are refused.

**Acceptance Scenarios**:

1. **Given** a school admin assigns the principal role to a user, **When** the audit log is opened, **Then** an entry shows actor, target user, "role added: principal", and the timestamp in Africa/Khartoum time.
2. **Given** any user including the school admin, **When** they attempt to change or delete an audit entry, **Then** the attempt is refused.
3. **Given** a non-admin staff user, **When** they query the access audit log directly, **Then** zero rows are returned.

---

### User Story 7 - Reserved portal roles have defined (but not yet usable) access (Priority: P3)

The guardian and student roles exist in the role model and in the matrix, with relationship scoping (a guardian sees only their linked students, a student only themselves). No login screen for them ships in this feature, but test identities with these roles can be created by test fixtures, and the matrix tests prove their scoping against existing data.

**Why this priority**: Defining and proving portal access now means feature 08 only needs to add login screens, not security rules. The defined access is useless until 08 ships, so it is P3 here.

**Independent Test**: Create a guardian test identity linked to Student X and a student test identity for Student Y. Query every existing data set directly as each and confirm that only X's (respectively Y's) permitted rows are returned.

**Acceptance Scenarios**:

1. **Given** a guardian test identity linked to Student X, **When** they query students, enrollments or any student-related data, **Then** only Student X's permitted rows are returned.
2. **Given** a guardian test identity, **When** they query money events, accounts, receipts, other students' balances, aging or dashboard data, **Then** zero rows are returned. Their only finance view is their own linked students' derived statement summary (FR-014).
3. **Given** a student test identity for Student Y, **When** they query any finance data or any other student's data, **Then** zero rows are returned.
4. **Given** no login flow exists yet, **When** someone tries to sign in through the staff login with a guardian or student identity, **Then** they are refused (portal login is feature 08).

---

### Edge Cases

- **Teacher with no allocations**: sees no academic or student data at all (not "everything", not an error). Feature 02 later adds allocations.
- **Teacher allocation removed mid-year**: access to that section's data ends within 5 minutes. Data the teacher entered earlier (in later features) stays attributed to them.
- **Student transferred to another section**: teacher and guardian visibility follows the current enrollment. Teachers of the old section lose access to the student's new records.
- **Guardian linked to several students (siblings)**: sees each linked student, and nothing of non-linked siblings or classmates.
- **Multi-role user loses one role**: keeps only the permissions of the remaining roles. Losing the last role leaves the user with no school access (treated like deactivated).
- **User whose only role is reserved (guardian/student) appears on the staff users page**: shown as portal users, not editable as staff in this feature.
- **Last school admin**: cannot be deactivated or demoted by anyone in the school, including themselves. Only the super-admin can replace a school's admin (existing tenant-management power).
- **Grace and locked subscription**: inviting users, assigning roles and granting optional permissions are writes and are blocked in grace (read-only) and locked (view/export only), like every write. **Deactivating a user and revoking roles or permissions stay allowed in every state**, because they only reduce access and a school must be able to remove a departed employee at any time. Every such change is still audited.
- **Super-admin**: keeps the existing user-directory powers (create a school's first admin, support actions), still has zero access to any school financial data, and cannot grant itself any school role.
- **Derived read functions**: statements, aging, KPIs, student directory, profile and balance helpers apply the same role and relationship checks as the underlying data, so they cannot be used to get around the matrix.
- **Notifications and SMS log**: in-app notifications about money (payments, overdue) are visible only to finance-permitted roles. The SMS log (it holds guardian phones and amounts owed) is finance-tier data.
- **Direct API with tampered identifiers**: a user who passes another school's or another student's ID in a request gets nothing, because access is decided from the caller's own identity and relationships, not from request parameters.
- **Removed or unknown role value**: if a role value is ever not recognized, the user gets no access (default deny).

## Requirements *(mandatory)*

### Functional Requirements

**Role model**

- **FR-001**: System MUST support these roles: `super_admin` (SaaS operator, no school), staff roles `school_admin`, `principal`, `student_affairs`, `teacher`, `accountant`, `viewer`, and reserved portal roles `guardian`, `student`.
- **FR-002**: `school_admin` MUST keep full access to every module of its own school, acting as the school's system administrator. It is the only school role that may manage users, roles, optional permissions and school settings.
- **FR-003**: `accountant` and `viewer` MUST keep exactly their Phase 1 permissions (FR-005 and FR-006 of spec 001), including every finance read and write they have today and nothing new by default.
- **FR-004**: A staff user MUST be able to hold one or more staff roles at the same time. Their effective rights are the union of those roles' rights, including each role's optional permissions as set by the school (FR-010). Rights are never granted to an individual user outside their roles. Every user still belongs to exactly one school and has at least one role while active. The portal roles (`guardian`, `student`) MUST NOT be combined with staff roles on the same account.
- **FR-005**: The existing `viewer` role [NEEDS CLARIFICATION: is `viewer` still needed once `principal` exists — keep it as-is, retire it by migrating viewers to principal, or keep it but deprecate it for new users?]. Whatever the answer, existing viewer users MUST keep their current access without any action from the school.

**Access matrix**

- **FR-006**: System MUST define a product-fixed access matrix over these modules: finance, students, academics, attendance, homework, exams, announcements, website CMS, settings, users. Each cell grants a subset of the actions view, create, edit, approve, publish.
- **FR-007**: The default matrix MUST be as follows. "Scoped" means limited to the user's relationships per FR-016 to FR-018. "—" means no access. Modules that do not exist yet (academics, attendance, homework, exams, announcements, website CMS) have their rights defined now and enforced when the module ships.

  | Module | school_admin | principal | student_affairs | teacher | accountant | viewer | guardian | student |
  |---|---|---|---|---|---|---|---|---|
  | Finance | all (as today) | see FR-012 | — | — | view, create, edit (as today) | view (as today) | view own linked students' statement summary | — |
  | Students (identity, enrollment, status) | all | view | view, create, edit | view (scoped, limited fields) | view (as today) | view (as today) | view (linked) | view (self) |
  | Academics (subjects, timetable, allocations) | all | view, create, edit, approve | view | view (scoped) | — | — | view (linked) | view (self) |
  | Attendance | all | view, approve | view, create, edit | view, create, edit (scoped) | — | — | view (linked) | view (self) |
  | Homework | all | view | view | view, create, edit, publish (scoped) | — | — | view (linked, published) | view (self, published) |
  | Exams & results | all | view, approve, publish | view | view, create, edit (scoped, marks only) | — | — | view (linked, published) | view (self, published) |
  | Announcements | all | view, create, edit, approve, publish | view, create, edit | view, create (scoped audience, needs approval) | view | view | view (addressed) | view (addressed) |
  | Website CMS | all | view, create, edit, approve, publish | view, create, edit | — | — | — | — | — |
  | Settings | all | view | — | — | — | — | — | — |
  | Users | all | view | — | — | — | — | — | — |

- **FR-008**: "Students, limited fields" for teachers MUST mean: name, photo, grade, section, enrollment status. It MUST exclude guardian contact (unless the optional permission in FR-010 is on), any financial field or status, and any internal notes.
- **FR-009**: Rights MUST combine as the union of the user's roles (FR-004), intersected with relationship scope. No combination may produce a right that is in the never-grantable set (FR-011).
- **FR-010**: The school admin MUST be able to turn on or off, per role within their own school, only the following product-defined optional permissions (default shown):
  - Teacher: view guardian name and phone for allocated students (default off).
  - Teacher: publish announcements to own sections without principal approval (default off).
  - Student affairs: view a student's fee standing as an indicator only (paid / partially paid / unpaid, no amounts) (default off).
  - Student affairs: send a manual SMS to a guardian through the existing credit and dispatch path (default off).
  - Principal: full finance read-only access, if not already granted by FR-012 (default off).
  - Principal: create and edit academic years and sections (default off).
  - Viewer: export reports (default per current viewer behaviour).
- **FR-011**: These MUST be impossible to grant through any screen or direct API call (the never-grantable set): any finance write to any role other than school admin and accountant; any finance read to teacher, student affairs (beyond the FR-010 indicator), guardian or student (beyond the FR-014 own-statement summary); user or role management to any role other than school admin; widening a guardian's or student's scope beyond their linked students or self; any access across schools.
- **FR-012**: Principal access to finance [NEEDS CLARIFICATION: does principal see finance data by default — none, full read-only (statements, aging, dashboard money KPIs, accounts), or summary-only (school-level dashboard totals, no per-student or per-account detail)?]. In every case the principal MUST NOT have any finance write right.
- **FR-013**: Money events, accounts, account balances, installments, payment allocations, receipts and receipt numbers, discounts, statements, aging, dashboard money figures, the SMS message log, SMS credit, and finance audit entries MUST be readable only by school admin, accountant, viewer, and the principal to the extent FR-012 allows.
- **FR-014**: A guardian's only finance visibility MUST be the derived statement summary (amount due, paid, remaining, upcoming installments) of their own linked students, served by the existing derived functions. It MUST NOT include raw money events, account names or balances, or any other student's data. This right is defined here and becomes usable in feature 08.

**Relationship scoping**

- **FR-015**: Relationship scope MUST be decided from the caller's own identity and stored relationships, never from values the caller supplies in a request.
- **FR-016**: A teacher MUST see academic and student data only for the sections and subjects allocated to them for the current academic year. Until allocations exist (feature 02), a teacher MUST see no academic or student data at all.
- **FR-017**: A guardian MUST see only students they are linked to. A student MUST see only their own record. The link records themselves are defined in feature 08 (guardian linking reuses the existing student guardian contact and does not duplicate it). Until then, links can be created only by test fixtures.
- **FR-018**: When a relationship ends (allocation removed, enrollment moved, guardian unlinked), access derived from it MUST end within 5 minutes.

**Enforcement**

- **FR-019**: Every rule MUST be enforced in the data layer, for both reads and writes. App screens hide what a role cannot use (defense in depth), but screens are never the only barrier.
- **FR-020**: No data-layer rule may grant access only for being signed in to the school. Every grant MUST require an explicit role or permission condition (and a relationship condition for scoped roles). Unknown or missing roles MUST get no access.
- **FR-021**: Every derived read or write function that today runs with elevated rights (statement, aging, dashboard KPIs, student directory and profile, balance and financial-status helpers, notification emitters, enrollment and installment generation) MUST enforce the same matrix and scope as the data it reads, so it cannot be used as a way around the matrix.
- **FR-022**: Finance stays the system of record. Nothing in this feature may write money rows. Enrollment done by student affairs MUST go through the existing enrollment path so installments are generated exactly as today.
- **FR-023**: All new writes (inviting, role assignment, permission grants) MUST respect subscription write-gating: blocked in grace and locked. Deactivating users and revoking roles or permissions MUST stay allowed in all subscription states (see Edge Cases).
- **FR-024**: The super-admin's Phase 1 boundaries MUST stay: tenant, subscription and SMS-credit management, the existing user-directory powers, and zero read access to any school's financial records or the school's access audit.

**User management**

- **FR-025**: School admins MUST be able to list their school's users with roles and status (invited, active, deactivated), invite staff by email with one or more staff roles, change roles, deactivate and reactivate users.
- **FR-026**: Invitations MUST expire after 7 days, be single-use, and be revocable before acceptance.
- **FR-027**: The system MUST prevent removing or deactivating the last active school admin, and MUST prevent any user from changing their own roles or permissions.
- **FR-028**: A deactivated user MUST lose all data access within 5 minutes, including through sessions opened before deactivation. Data they created stays attributed to them.
- **FR-029**: Staff login MUST refuse identities whose only roles are portal roles (guardian, student). Portal login is feature 08.
- **FR-030**: All user-management screens and messages MUST be Arabic and right-to-left, with dates shown in Africa/Khartoum time.

**Audit**

- **FR-031**: The system MUST record an immutable audit entry for every invitation (sent, accepted, revoked, expired), role added or removed, deactivation, reactivation, and optional-permission change, with actor, target user, before and after values, and timestamp.
- **FR-032**: Access audit entries MUST NOT be editable or deletable by anyone, and MUST be readable only by the school admin of that school (and the principal if the Users "view" right applies).
- **FR-033**: School admins MUST be able to filter the access audit log by user, action type and date range, and export it.

**Verification**

- **FR-034**: For every existing tenant data set and every derived function, an automated test MUST prove, by direct data-API queries made with each role's own session (not through screens), that each role sees and can change exactly what the matrix and scope allow, including negative cases (zero rows) for every role that must be denied.
- **FR-035**: An automated policy audit MUST fail if any data-layer rule grants access based only on signed-in status within a school, or if any tenant data set lacks an explicit role-aware rule.
- **FR-036**: The full existing Playwright suite and Gauntlet checks from spec 001 MUST pass unchanged.

### Key Entities *(include if feature involves data)*

- **User** (extended): a person signed in to exactly one school (except the super-admin). Gains a status (invited / active / deactivated) and, per FR-004, one or more roles.
- **Role assignment**: links a user to a role within their school. A staff user may have several (FR-004), and each assignment carries who assigned it and when.
- **Role**: product-defined set (FR-001). Schools cannot create new roles.
- **Access matrix (default)**: product-fixed mapping of role × module → allowed actions (FR-007). Same for all schools.
- **Optional permission**: a product-defined permission in the FR-010 catalogue that a school admin may turn on or off for a role within their school. Stored per school and per role.
- **Invitation**: a pending invite for an email address with intended roles, inviter, expiry, and state (pending / accepted / revoked / expired).
- **Relationship scope sources**: teacher allocation (feature 02), guardian ↔ student link (feature 08; reuses existing student guardian contact), and student self-identity link (feature 08). This feature defines how they limit access, not their screens.
- **Access audit entry**: immutable record of a role, permission or user-status change with actor, target, before and after, and timestamp.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of existing tenant data sets and derived functions have automated direct-query tests covering all 9 roles. Every test passes and every denied case returns zero rows.
- **SC-002**: 0 data-layer rules grant access only for being signed in to the school, verified by the automated policy audit on every change.
- **SC-003**: 100% of existing Playwright and Gauntlet checks from spec 001 pass unchanged after migration. Existing users need 0 steps from the school to keep working.
- **SC-004**: An authenticated teacher querying their own school's money events directly gets 0 rows, in every subscription state.
- **SC-005**: A school admin can invite a staff member and assign roles in under 2 minutes, and the invited person can be signed in and working in under 5 minutes after opening the invitation.
- **SC-006**: Deactivation, role removal and permission revocation take full effect in at most 5 minutes, including on already-open sessions.
- **SC-007**: 100% of role, permission and user-status changes produce exactly one audit entry with actor, target, before/after and timestamp, and 0 audit entries can be edited or deleted.
- **SC-008**: Accountant daily tasks (record payment, print receipt, view statement and aging) take no longer than before this feature, measured on a school with 2,000 students.
- **SC-009**: Attempts to grant any never-grantable permission (FR-011) are refused 100% of the time, whether made through screens or direct API calls.

## Assumptions

- Staff are invited by email and set a password, matching the existing staff login. SSO is out of scope. Guardian and student login (likely phone-based) is feature 08.
- The default matrix in FR-007 is the product's starting point. Cells for modules that ship in later features (academics, attendance, homework, exams, announcements, website CMS) may be refined in those features' specs but must not widen finance or cross-relationship access.
- "Approve" and "publish" are separate rights so that, for example, a teacher can enter marks that the principal approves and publishes. Results are never public (website or otherwise). They are published only to the linked guardian and the student.
- A teacher who is also a parent at the school uses a separate portal identity for their child (FR-004 forbids combining portal and staff roles on one account).
- Homeroom-type duties ("teacher who is also the homeroom coordinator") are modelled as allocations in feature 02, not as a separate role.
- Existing Phase 1 users are migrated one-to-one: each keeps its single current role as its only role assignment.
- The 5-minute limit for revocations is acceptable given school operating patterns. A shorter limit can be set during planning if it costs little.
- Scale target: ~100 schools, up to ~2,000 students and ~150 staff users per school. Access checks must not noticeably slow finance screens at this scale.
- No WhatsApp, online payment gateway or AI features are involved.

## Dependencies

- Spec 001 (built): users, tenants, subscription write-gating, finance data and derived functions, notifications, SMS credit and dispatch path, audit entries.
- Feature 02: teacher allocations. Until it ships, teachers have no academic or student data access.
- Feature 08: guardian and student login and the guardian/student link records. Until it ships, portal roles are exercised only through test fixtures.

## Out of Scope

- Guardian and student login screens (feature 08).
- SSO or any external identity provider.
- The academic modules themselves (academics, attendance, homework, exams, announcements, website CMS). This feature defines their access rights only.
- School-defined custom roles beyond the FR-010 optional-permission catalogue.

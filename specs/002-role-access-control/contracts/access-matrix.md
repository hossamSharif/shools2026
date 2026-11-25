# Contract: Access Matrix (permission keys × roles × data sets)

This is the single source of truth for the seed of `permission`, `role_permission_default`
and `optional_permission`, and for `ACCESS_EXPECTATIONS` in `@erp/shared/access`, which the
matrix tests (FR-034) and the screen guards both import.

Legend: **D** = default grant · **O** = optional switch, off by default · **O+** = optional
switch, on by default · **—** = none · **✗** = never-grantable (FR-011; the schema cannot
store it) · *(s)* = stage-scopable for principal/student_affairs · *(rel)* = relationship-scoped
(teacher allocation / portal link).

## 1. Keys enforced in this feature (existing data sets)

| Key | school_admin | principal | student_affairs | teacher | accountant | viewer | guardian | student |
|---|---|---|---|---|---|---|---|---|
| `school.profile_read` | D | D | D | D | D | D | D | D |
| `finance.read` | D | ✗ | ✗ | ✗ | D | D | ✗ | ✗ |
| `finance.totals` | D | D | — | ✗ | D | D | ✗ | ✗ |
| `finance.write` | D | ✗ | ✗ | ✗ | D | ✗ | ✗ | ✗ |
| `finance.export` | D | — | ✗ | ✗ | D | O+ | ✗ | ✗ |
| `sms.send_manual` | D | — | O *(s)* | — | D | — | ✗ | ✗ |
| `students.read` | D | D *(s)* | D *(s)* | — | D | D | — | — |
| `students.read_limited` | — | — | — | D *(rel)* | — | — | — | — |
| `students.guardian_contact` | — | — | — | O *(rel)* | — | — | — | — |
| `students.fee_indicator` | — | — | O *(s)* | ✗ | — | — | ✗ | ✗ |
| `students.write` | D | — | D *(s)* | ✗ | D | — | ✗ | ✗ |
| `students.delete` | D | — | — | ✗ | — | — | ✗ | ✗ |
| `students.export` | D | D *(s)* | D *(s)* | — | D | D | ✗ | ✗ |
| `structure.read` | D | D *(s)* | D *(s)* | D *(rel)* | D | D | — | — |
| `structure.write` | D | O | — | ✗ | D | — | ✗ | ✗ |
| `users.read` | D | D | — | — | — | — | ✗ | ✗ |
| `users.manage` | D | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `settings.read` | D | D | — | — | — | — | ✗ | ✗ |
| `settings.manage` | D | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `portal.linked` | — | — | — | — | — | — | D *(rel)* | ✗ |
| `portal.self` | — | — | — | — | — | — | ✗ | D *(rel)* |

`super_admin` holds **no** key. It keeps its Phase 1 policies (`school`, `subscription`,
`sms_credit_topup`, `user` directory) through `current_is_super_admin()` only (FR-024).

Notes:
- The accountant's `students.write` and `structure.write` keep the **actual Phase 1 behaviour**
  (research R0/R4). They add nothing compared with today.
- The principal's `finance.totals` gives the `dashboard_kpis` *totals subset* (§3), through the
  function only (Article XIV). A principal who needs full finance read is also given the
  **viewer role**, and then reads finance as a viewer (FR-012). The principal role never grants
  `finance.read` or `finance.write`.
- Multi-role = union (FR-004/009). ✗ means **that role** can never grant the key, by default or by
  switch. A user who is explicitly assigned another role that holds the key (e.g. principal +
  viewer) has it through that role, which is how Article XIV's "school_admin, accountant, viewer
  only" rule is kept. A ✗ cell is never reachable through optional switches,
  because no role can grant it to the holder of another role.

## 2. Keys defined now, enforced when the module ships (FR-007)

`enforced = false` in `permission`. They appear on the permissions screen as read-only
defaults.

| Module | Keys (action) | Defaults |
|---|---|---|
| Academics | `academics.view/create/edit/approve` | admin all · principal view/create/edit/approve *(s)* · SA view *(s)* · teacher view *(rel)* · guardian/student view *(rel)* |
| Attendance | `attendance.view/create/edit/approve` | admin all · principal view/approve *(s)* · SA view/create/edit *(s)* · teacher view/create/edit *(rel)* · portal view *(rel)* |
| Homework | `homework.view/create/edit/publish` | admin all · principal, SA view *(s)* · teacher view/create/edit/publish *(rel)* · portal view published *(rel)* |
| Exams & results | `exams.view/create/edit/approve/publish` | admin all · principal view/approve/publish *(s)* · SA view *(s)* · teacher view/create/edit marks *(rel)* · portal view published *(rel)* |
| Announcements | `announcements.view/create/edit/approve/publish`, `announcements.publish_own` | admin all · principal all *(s)* · SA view/create/edit *(s)* · teacher view/create *(rel)*, `publish_own` **O** · accountant, viewer view · portal view addressed |
| Website CMS | `cms.view/create/edit/approve/publish` | admin all · principal all · SA view/create/edit · others — |

## 3. Data set → required key (read / write), all within `school_id = current_school_id()`

| Data set / function | Read requires | Write requires | Teacher | Guardian / Student |
|---|---|---|---|---|
| `school` (own row) | `school.profile_read` | `settings.manage` (update) | name/logo only | same |
| `subscription` | `school.profile_read` | super-admin only | lifecycle banner | same |
| `academic_year`, `section` | `structure.read` *(s/rel)* | `structure.write` | allocated sections (none until 02) | — |
| `student` | `students.read` *(s)* or portal link | `students.write` *(s)*; delete `students.delete` | **0 rows**, use `teacher_roster()` | linked / self rows |
| `enrollment` | as `student` | `students.write` *(s, grade's stage)* | 0 rows | linked / self |
| `account`, `fee_structure`, `fee_item`, `installment_schedule`, `reminder_rule` | `finance.read` | `finance.write` | 0 | 0 |
| `installment`, `money_event`, `payment_allocation`, `receipt_counter`, `discount`, `audit_entry`, `sms_message_log`, `sms_credit_topup`, `sms_credit_consumption` | `finance.read` | definer money functions only | 0 | 0 |
| `notification` | own; money types also need `finance.read` | own mark-read | own non-money | own non-money |
| storage `money-attachments` | `finance.read` | `finance.write` | denied | denied |
| storage `school-logos` | unchanged | `settings.manage` | — | — |
| storage `student-photos` (private) | `students.read` *(s)* or portal link, as signed URL only | `students.write` *(s)* | allocated students, signed URL only | linked / self, signed URL only |
| `user`, `role_assignment(_stage)`, `invitation`, `school_role_permission`, `access_audit_entry`, `portal_link` | `users.read` (plus own rows for `user`, `role_assignment`, `portal_link`) | definer functions with `users.manage` | own only | own only |
| `student_statement`, `student_payments`, `receivables_aging`, `account_balance`, `installment_running_balance`, `student_balance` | `finance.read` | — | FORBIDDEN | FORBIDDEN |
| `student_financial_summary`, `student_installments` | `finance.read`, **or** `portal.linked` for a linked student (FR-014 summary) | — | FORBIDDEN | guardian: linked only · student: FORBIDDEN |
| `dashboard_kpis` | `finance.read` → full; `finance.totals` → totals subset | — | FORBIDDEN | FORBIDDEN |
| `student_directory` | `students.read` *(s)*; finance columns NULL without `finance.read`; `fin_status` with `finance.read` or `students.fee_indicator` | — | FORBIDDEN | FORBIDDEN |
| `teacher_roster` | `students.read_limited` *(rel)* (+ guardian contact with switch) | — | allocated only | FORBIDDEN |
| money RPCs (`apply_fee_payment`, `record_*`, `apply_discount`, `reverse_event`, `record_opening_balance`) | — | `finance.write` + `assert_writes_allowed` | FORBIDDEN | FORBIDDEN |
| `topup_sms_credit` | — | super-admin (unchanged) | FORBIDDEN | FORBIDDEN |
| `sms_credit_balance` | `finance.read` (+ own school) | — | FORBIDDEN | FORBIDDEN |
| `consume_sms_credit`, `check_low_sms_credit`, `generate_installments` | not executable by `authenticated` (worker / trigger only) | — | no EXECUTE | no EXECUTE |

Every function above also refuses ids from another school with `FORBIDDEN_SCHOOL` (rpc-contracts §E0). The matrix test passes School B ids as a School A accountant to each one.

**Totals subset of `dashboard_kpis`** (principal default): `collected_month`, `collected_year`,
`outstanding`, `collection_rate`, `overdue_count`. These are the existing school-level
aggregate keys. Billed totals already feed `collection_rate`, and no new key is added, so the
finance roles' payload is unchanged. The subset excludes `accounts[]`,
`combined_balance`, `expenses_month`, `net_cash_flow_month` and `sms_credit_remaining`,
because those are per-account or finance-operational detail (FR-012). The keys keep the same
names as the full payload, so the existing dashboard cards render the subset unchanged.

## 4. Error vocabulary (all `errcode P0001`, Arabic `hint`)

| Code | Meaning |
|---|---|
| `FORBIDDEN_PERMISSION` | caller lacks the key |
| `FORBIDDEN_SCHOOL` / `FORBIDDEN_STUDENT` | existing Phase 1 codes, unchanged (also used for out-of-scope students) |
| `NOT_FOUND` | target not in caller's school (no existence leak) |
| `SELF_CHANGE_FORBIDDEN` | user changing own roles/permissions/status |
| `LAST_ADMIN_PROTECTED` | would leave the school with no active school_admin |
| `PORTAL_STAFF_MIX` | portal + staff roles on one account |
| `STAGE_SCOPE_NOT_ALLOWED` | stages on a role other than principal/student_affairs |
| `ROLES_REQUIRED` | empty role set for an active user |
| `NOT_GRANTABLE` | key/role not in the optional catalogue |
| `EMAIL_IN_USE` | email already belongs to a user |
| `INVITATION_INVALID` | token unknown, used, revoked or expired (one code, so nothing leaks) |
| `WRITES_GATED` | existing write-gating code, on grant paths only |
| `AUDIT_IMMUTABLE` | update/delete attempted on `access_audit_entry` |

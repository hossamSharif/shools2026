# Feature Specification: School Fee Accounting (System of Record)

**Feature Branch**: `001-fee-accounting`
**Created**: 2026-06-30
**Status**: Draft
**Input**: User description: "Phase 1: School Fee Accounting (System of Record) — multi-tenant Arabic/RTL SaaS that schools use to manage the accounting side of student fees and school expenses, including school structure, the canonical set of money events, printable statements, bursar reports, the admin dashboard, roles, subscription and SMS-credit state, and the reminder engine that sends SMS to guardians."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Super-admin onboards a school tenant (Priority: P1)

A single SaaS operator (super-admin) creates a new school as a tenant, sets its annual subscription period (start and end dates), and adds an initial SMS-credit balance. The super-admin can manage all schools but never sees or edits the financial records inside any school.

**Why this priority**: Multi-tenancy is the foundation. No school structure, money, or reporting can exist until a tenant exists with an active subscription and a credit balance. It is the first demonstrable slice of value for the operator.

**Independent Test**: Create a school with a name and subscription window, add SMS credit, confirm the school appears in the operator's school list with the correct subscription dates and credit balance, and confirm the operator cannot open the school's ledger or money events.

**Acceptance Scenarios**:

1. **Given** the super-admin is signed in, **When** they create a school with a name and an annual subscription period, **Then** the school is created with that subscription window and a starting SMS-credit balance of zero.
2. **Given** an existing school, **When** the super-admin adds SMS credit, **Then** the school's credit balance increases by that amount and a top-up record (amount, who, when) is logged.
3. **Given** the super-admin is viewing a school, **When** they attempt to open that school's financial records or money events, **Then** access is denied (operator cannot read or edit tenant financial data).
4. **Given** a school exists, **When** the super-admin sets or updates its subscription start and end dates, **Then** the new period takes effect and drives that school's countdown and lifecycle state.

---

### User Story 2 - School admin builds the school spine and enrolls students (Priority: P1)

A school admin sets up academic years (one marked current), the three fixed stages with their 12 grades, sections under grades, cash and bank accounts with opening balances, and per-grade per-year fee structures split into installments with due dates. Enrolling a student into a grade+section for a year generates that student's installments with amounts owed and due dates.

**Why this priority**: This is the structural backbone ("the spine"). Without years, grades, accounts, and fee structures, no money event or invoice can be recorded. Enrollment-driven installment generation is what makes the system a record of what each student owes.

**Independent Test**: Set up a current academic year, the grades/sections, at least one cash and one bank account with opening balances, and a fee structure with installments for a grade; enroll a student into that grade+section; confirm the student's installments are generated with the correct amounts and due dates.

**Acceptance Scenarios**:

1. **Given** a school with no structure, **When** the admin creates an academic year and marks it current, **Then** exactly one year is current and others are not.
2. **Given** the fixed stages exist (Primary/Middle/Secondary), **When** the admin views grades, **Then** Primary shows 6 grades, Middle 3, and Secondary 3 (12 total), labelled in Arabic.
3. **Given** a grade, **When** the admin adds one or more sections (شعبة), **Then** sections organize students and reports but do not affect any money calculation.
4. **Given** the admin defines a fee structure for a grade and year with fee items and a chosen number of installments each with a due date, **When** they save it, **Then** the structure is stored for that grade+year with its installment schedule.
5. **Given** a fee structure exists for a grade+year, **When** the admin enrolls a student into that grade+section for that year, **Then** the student's installments are generated with amounts owed and due dates matching the structure.
6. **Given** a cash or bank account, **When** the admin records its opening balance at onboarding, **Then** the account's live balance starts from that opening figure and is thereafter derived from events.

---

### User Story 3 - Accountant records a fee payment with a receipt (Priority: P1)

An accountant records a guardian's payment toward a student's installment(s). Payments may be partial, must name the receiving account (cash or a specific bank), may carry an attachment image, are issued a sequential gapless receipt number unique within the school, and produce a printable receipt. The student's running balance and the account balance both update only via the posted event.

**Why this priority**: Recording money in — accurately, with an auditable receipt and correct derived balances — is the core purpose of the system of record. It is the headline demonstrable capability of Phase 1.

**Independent Test**: With a student who has an outstanding installment and at least one account, record a partial payment to a chosen account with an attached image; confirm a sequential receipt number is issued, a printable receipt is produced, and both the student's running balance and the account balance change by exactly the payment amount.

**Acceptance Scenarios**:

1. **Given** a student with an outstanding installment, **When** the accountant records a partial payment against it to a chosen account, **Then** the installment's running balance is reduced by the payment and the account balance increases by the same amount.
2. **Given** a payment is recorded, **When** it is posted, **Then** it receives the next sequential, gapless, never-reused receipt number unique within the school.
3. **Given** a posted payment, **When** the accountant prints the receipt, **Then** the receipt shows student, grade/section, amount, account, date, receipt number, and running balance.
4. **Given** a payment with an attached image (bank slip or cash receipt photo), **When** it is posted, **Then** the image is stored with the payment record.
5. **Given** a posted payment, **When** anyone attempts to edit or delete it, **Then** it cannot be silently changed; a correction is only possible via a reversing entry that is itself audited.
6. **Given** multiple payments against one installment, **When** they are recorded over time, **Then** each reduces the same running balance until the installment is fully paid.

---

### User Story 4 - Record the full set of money events (Priority: P2)

Accountants and admins record the remaining canonical money events: expenses (money out from an account, with category, optional vendor, description, optional attachment), inter-account transfers (neutral, keeping both balances correct), refunds (money out to a guardian, adjusting the student ledger), and write-offs/adjustments (forgiving or correcting a student balance). The school can also apply discounts, scholarships, and sibling waivers that reduce what a student owes without moving cash.

**Why this priority**: A complete system of record needs every way money moves and every way a charge is reduced. These complete the canonical event set after the core money-in flow, and each is independently valuable to a bursar.

**Independent Test**: Record one expense from an account, one transfer between two accounts, one refund to a guardian, and one write-off on a student balance; confirm each touches the correct account(s), is audited, and is reflected in the derived balances; apply a discount to a student and confirm the amount owed drops without any cash movement.

**Acceptance Scenarios**:

1. **Given** an account with a balance, **When** an expense is recorded against it with a category, **Then** the account balance decreases by the expense amount and the event is audited.
2. **Given** two of the school's own accounts, **When** a transfer is recorded between them, **Then** the source balance decreases and the destination increases by the same amount, with no effect on income or expense totals.
3. **Given** a student who previously paid, **When** a refund is recorded to that guardian from an account, **Then** the account balance decreases, the student's ledger is adjusted, and the event is not counted as an expense.
4. **Given** a student balance, **When** the bursar records a write-off/adjustment, **Then** the amount the student owes changes and the change is audited (never a silent edit).
5. **Given** a specific student, **When** a discount/scholarship (percentage or fixed) or a sibling waiver is applied, **Then** the amount the student owes is reduced, no cash moves, and the reduction is attributable to a user and visible on the student statement.

---

### User Story 5 - Student statement and receivables aging report (Priority: P2)

A school admin, accountant, or viewer produces a clean printable/exportable student statement (all charges, discounts, payments, and refunds with a running balance and total owed) and the receivables/unpaid aging report (students not fully paid, bucketed current / 1–30 / 31–60 / 61–90 / 90+ days overdue, filterable by stage, grade, and section, with per-student amounts and per-bucket totals).

**Why this priority**: Reporting is what a bursar acts on day to day. The statement proves a single student's position; the aging report is the bursar's core collection tool. Both depend on the money events from earlier stories.

**Independent Test**: For a student with charges, a discount, and partial payments, generate the statement and confirm the running balance and total owed are correct and it exports; generate the receivables report, confirm unpaid students fall into the correct aging buckets, filter by grade, and confirm bucket totals and export.

**Acceptance Scenarios**:

1. **Given** a student with charges, discounts, payments, and refunds, **When** the statement is generated, **Then** it lists every line in order with a running balance and the total still owed, and can be printed/exported as PDF.
2. **Given** students with overdue installments, **When** the receivables report is generated, **Then** each unpaid student appears in the correct aging bucket based on how overdue their amount is.
3. **Given** the receivables report, **When** the user filters by stage, grade, and/or section, **Then** the list and bucket totals reflect only the filtered population.
4. **Given** the receivables report, **When** the user exports it, **Then** the report data is exported in a tabular format with per-bucket totals.

---

### User Story 6 - School admin dashboard (Priority: P2)

The school admin's home shows the balance of every account individually plus a combined total, total collected (this month and this academic year), total outstanding receivables, collection rate (collected ÷ charged), expenses this month, net cash flow, count of students overdue, SMS credit remaining, and a pinned subscription countdown banner.

**Why this priority**: The dashboard turns the underlying records into an at-a-glance operating picture for the admin. It is high value but derives entirely from data produced by earlier stories.

**Independent Test**: With accounts, charges, payments, and expenses present, open the dashboard and confirm each account balance, the combined total, the listed KPIs, the SMS credit figure, and the subscription countdown all show correct, derived values.

**Acceptance Scenarios**:

1. **Given** several accounts with activity, **When** the admin opens the dashboard, **Then** each account's balance is shown individually plus a combined total, all derived from events.
2. **Given** charges and payments in the current month and year, **When** the dashboard loads, **Then** total collected (month and year), outstanding receivables, and collection rate are shown correctly.
3. **Given** expenses this month, **When** the dashboard loads, **Then** monthly expenses and net cash flow are shown.
4. **Given** students with overdue installments, **When** the dashboard loads, **Then** the count of overdue students and the SMS credit remaining are shown.
5. **Given** an active subscription, **When** the admin opens the home, **Then** a pinned banner shows days remaining until subscription expiry.

---

### User Story 7 - Reminder rules and SMS dispatch to guardians (Priority: P2)

A school admin configures reminder rules (any combination of N days before due, on the due date, and N days after due) with sensible defaults that can be changed or disabled. A daily scheduled process finds installments matching active rules, builds the Arabic message for each student's guardian, checks credit, sends via the SMS provider, records the result and delivery status, and decrements credit by segment count atomically with the send. An admin or accountant can also send a manual reminder on demand. Every message is logged per school and viewable per student.

**Why this priority**: The reminder engine is an explicit Phase 1 deliverable and the only outbound channel in scope. It depends on installments, guardian phone numbers, and the SMS-credit state, so it follows the structural and money stories.

**Independent Test**: Configure reminder rules, run the daily dispatch against students with matching installments, confirm Arabic SMS are sent to guardians, credit decrements by segment count, students with no valid phone or insufficient credit are skipped and counted, and every message is logged with a delivery status; then send one manual reminder with the same behavior.

**Acceptance Scenarios**:

1. **Given** a school's reminder rules, **When** the admin sets when reminders fire relative to due dates, **Then** each rule (before/on/after) can be enabled, disabled, or changed, with sensible defaults provided.
2. **Given** the daily dispatch runs, **When** an installment matches an active rule and the guardian has a valid phone and the school has enough credit, **Then** an Arabic reminder containing student name, grade/level, due amount in SDG, due date, and school name is sent and logged.
3. **Given** a message is accepted by the provider, **When** it is sent, **Then** the school's credit decreases by the message's segment count and the send-and-decrement happen as a single atomic action (credit can never go negative or be charged twice).
4. **Given** a student has no valid guardian phone, **When** the dispatch processes them, **Then** they are skipped and counted (no message sent).
5. **Given** the school's credit is insufficient for a message, **When** the dispatch reaches it, **Then** that message is not sent, the school admin is alerted, and the batch stops cleanly and reports how many were sent vs skipped.
6. **Given** an admin or accountant, **When** they send a manual reminder to one guardian, **Then** the same credit, atomicity, and logging rules apply.
7. **Given** any sent message, **When** the bursar views the SMS log per school or per student, **Then** they see recipient number, student, message text, segment/credit count, status (queued/sent/delivered/failed), and timestamp.

---

### User Story 8 - Subscription lifecycle enforcement (Priority: P3)

When a school's annual subscription expires, the school enters a grace period (default 14 days) during which it becomes read-only (records can be viewed and exported, but no new money events or edits). After the grace period the school is fully locked except for viewing and exporting its own records — a school never loses sight of its own ledger.

**Why this priority**: Lifecycle enforcement protects the business model but is not needed to demonstrate the core record-keeping. It layers a state machine over already-working functionality.

**Independent Test**: Move a school past its subscription end date and confirm it becomes read-only during the grace window (viewing/exporting allowed, new money events blocked); move it past the grace window and confirm full lock except for viewing/exporting.

**Acceptance Scenarios**:

1. **Given** a school whose subscription end date has passed, **When** it is within the grace period, **Then** users can view and export records but cannot create new money events or edits.
2. **Given** a school past the end of its grace period, **When** users access it, **Then** the school is fully locked except for viewing and exporting its own records.
3. **Given** an expiring subscription, **When** the admin opens the home, **Then** the pinned countdown reflects the remaining days and lifecycle state.

---

### User Story 9 - In-app notification center (Priority: P3)

A simple in-app notification center (bell) surfaces relevant events to the right user: payment recorded, low SMS credit, and subscription expiring soon. There is no external delivery (no SMS, no push) for these notifications in this phase.

**Why this priority**: In-app notifications improve awareness but are a light addition that depends on events already produced elsewhere. They are the lowest-criticality slice.

**Independent Test**: Trigger a payment, drive credit low, and approach subscription expiry; confirm each surfaces as an in-app notification to the relevant user with no external message sent.

**Acceptance Scenarios**:

1. **Given** a payment is recorded, **When** the relevant user opens the notification center, **Then** a "payment recorded" notification is present.
2. **Given** SMS credit falls below the low threshold, **When** the school admin checks notifications, **Then** a low-credit notification is present.
3. **Given** the subscription is nearing expiry, **When** the school admin checks notifications, **Then** a "subscription expiring soon" notification is present, with no SMS or push sent for any of these.

---

### Edge Cases

- **Receipt numbering integrity**: A payment fails to post midway — the system must not leave a gap in or reuse a receipt number; numbering stays sequential and gapless within the school.
- **Partial then over-payment**: A payment would exceed the remaining installment balance — the system must prevent the installment running balance from going negative (or handle overpayment per a defined rule), and the student statement must remain consistent.
- **Reversal of a wrong event**: A payment, expense, transfer, refund, or adjustment was posted incorrectly — only a reversing entry corrects it; both the original and the reversal remain visible and audited.
- **Mid-year onboarding**: A school joins partway through a year and must enter account opening balances and each student's carried-in outstanding balance without losing history.
- **Enrollment without a fee structure**: A student is enrolled into a grade+year that has no fee structure yet — the system must define the expected behavior (no installments generated until a structure exists, or block enrollment).
- **Tenant isolation breach attempt**: A user (or a crafted query) tries to read or modify another school's data — it must be impossible.
- **SMS segment edge**: An Arabic reminder spans an unexpected number of Unicode segments — credit must decrement by the actual segment count, not a flat 1.
- **Credit exhaustion mid-batch**: A reminder batch depletes credit partway — it stops cleanly, sends nothing further, and reports sent vs skipped counts.
- **Missing or invalid guardian phone**: A student has no usable phone — reminders skip and count them; the rest of the batch proceeds.
- **Provider reports failure after acceptance**: A message accepted (and charged) is later marked failed — the failure is recorded and surfaced but does not auto-refund credit in this phase.
- **Read-only/locked state during a batch**: A school crosses into grace/locked state while operations are pending — new money events are blocked while viewing/exporting and (per assumption) reminder visibility remain available.
- **Withdrawn/graduated student with a balance**: A student changes status while still owing — the statement and receivables must continue to reflect the outstanding amount.
- **Current academic year switch**: Exactly one year is current at all times; switching the current year must not corrupt existing enrollments or balances.

## Requirements *(mandatory)*

### Functional Requirements

**Roles, tenancy, and access**

- **FR-001**: System MUST support four roles — super-admin (SaaS operator), school admin, accountant, and viewer — with the access boundaries below.
- **FR-002**: System MUST scope every user except the super-admin to exactly one school, and MUST ensure no user or query can read or modify any other school's data (strict tenant isolation).
- **FR-003**: System MUST allow the super-admin to create and manage school tenants, set each school's annual subscription period, and add SMS credit, while preventing the super-admin from viewing or editing any school's financial records.
- **FR-004**: System MUST give the school admin full access within their own school (structure, fees, money, reports, users, settings).
- **FR-005**: System MUST limit the accountant to recording money events (payments, expenses, transfers, refunds, adjustments) and viewing reports within their school, and MUST prevent them from changing settings, fee structures, users, or the subscription.
- **FR-006**: System MUST limit the viewer to read-only access to reports and statements within their school.

**School structure**

- **FR-007**: System MUST let a school define one or more academic years with exactly one marked current at any time.
- **FR-008**: System MUST provide three fixed stages (Primary/الابتدائية, Middle/المتوسطة, Secondary/الثانوية) with their fixed grade counts (6/3/3, 12 total), labelled in Arabic.
- **FR-009**: System MUST allow one or more sections (شعبة) per grade that organize students and group reports without affecting any money calculation.
- **FR-010**: System MUST maintain a student profile (name, guardian name, guardian phone number, optional photo, status active/withdrawn/graduated).
- **FR-011**: System MUST represent an enrollment that ties a student to a grade+section within a specific academic year, and MUST support a student moving through grades across years.

**Accounts and derived balances**

- **FR-012**: System MUST let a school define its own accounts, each of type cash or bank, allowing multiple cash accounts and any number of named bank accounts each with an optional account number.
- **FR-013**: System MUST capture an opening balance per account at onboarding.
- **FR-014**: System MUST always derive an account's live balance from its opening balance plus every money event that touched it, and MUST never store the live balance as an editable figure.
- **FR-015**: System MUST require every money event that touches an account to reference exactly one account.

**Fees, enrollment-driven invoices, and reductions**

- **FR-016**: System MUST let a school define a fee structure per grade per academic year, listing one or more fee items (e.g. tuition, transport, books, exam, uniform) with amounts, allowing different amounts per grade.
- **FR-017**: System MUST allow each fee structure to be split into a flexible number of installments, each with its own due date (no forced term count).
- **FR-018**: System MUST generate a student's installments (amounts owed and due dates) from the matching fee structure when the student is enrolled in a grade for a year.
- **FR-019**: System MUST let a school reduce what a specific student is charged via a discount/scholarship (percentage or fixed amount) or a sibling waiver, recording it as a non-cash reduction attributable to a user and visible on the student statement.

**Money events (canonical set, append-only, audited)**

- **FR-020**: System MUST record every money event as append-only and audited (who, what, when), immutable after posting, with corrections made only by reversing entries — never by silent edit or delete.
- **FR-021**: System MUST support fee payments (money in) toward a student's installment(s), including partial payments where many payments may apply to one installment, each reducing a running balance.
- **FR-022**: System MUST record which account received each fee payment, allow an optional attachment image, and issue a sequential, gapless, never-reused receipt number unique within the school.
- **FR-023**: System MUST produce a printable receipt for each payment showing student, grade/section, amount, account, date, receipt number, and running balance.
- **FR-024**: System MUST support expenses (money out) from a chosen account with a category, optional vendor, description, and optional attachment image.
- **FR-025**: System MUST support inter-account transfers between two of the school's own accounts that keep both balances correct and count as neither income nor expense.
- **FR-026**: System MUST support refunds (money out) to a guardian that adjust the student's ledger and are not counted as expenses.
- **FR-027**: System MUST support write-offs/adjustments that change what a student owes, audited and never applied as a silent edit.
- **FR-028**: System MUST always derive a student's balance from their charges, discounts/waivers, payments, refunds, and adjustments, never storing it as an editable figure.

**Onboarding mid-year**

- **FR-029**: System MUST let a school joining partway through a year enter starting balances — the opening balance of each account and each student's carried-in outstanding balance — without losing history.

**Statements and reports**

- **FR-030**: System MUST produce a student statement: a clean, printable/exportable ledger for one student listing all charges, discounts, payments, and refunds with a running balance and the total still owed.
- **FR-031**: System MUST produce a receivables/unpaid aging report listing students not fully paid, bucketed by overdue age (current / 1–30 / 31–60 / 61–90 / 90+ days), filterable by stage, grade, and section, showing amount owed per student and totals per bucket.
- **FR-032**: System MUST export statements and receipts as PDF and export report data in a tabular format.

**Dashboard**

- **FR-033**: System MUST present a school admin dashboard showing each account's balance individually plus a combined total, total collected (this month and this academic year), total outstanding receivables, collection rate (collected ÷ charged), expenses this month, net cash flow, count of overdue students, SMS credit remaining, and a pinned subscription countdown banner.

**Subscription lifecycle**

- **FR-034**: System MUST hold an annual subscription period (start and end date) per school, set by the super-admin, and show a pinned countdown to expiry on the school admin home.
- **FR-035**: System MUST, on subscription expiry, place the school into a grace period (default 14 days) during which it is read-only (view and export allowed; no new money events or edits).
- **FR-036**: System MUST, after the grace period, fully lock the school except for viewing and exporting its own records.

**SMS credit**

- **FR-037**: System MUST maintain an SMS credit balance per school, allow only the super-admin to add credit, and log every top-up (amount, who, when).
- **FR-038**: System MUST show the school admin the credit balance and a low-credit indicator/alert.
- **FR-039**: System MUST decrement credit by each message's segment count (Arabic/Unicode ~70 characters per segment), not a flat amount per message.
- **FR-040**: System MUST make the send and the credit decrement a single atomic action so credit can never go negative or be charged twice under a batch.
- **FR-041**: System MUST skip any message the school's credit cannot cover, alert the school admin, and stop a depleted reminder batch cleanly while reporting sent vs skipped counts.

**Reminders and SMS sending**

- **FR-042**: System MUST let a school admin configure reminder rules as any combination of N days before due, on the due date, and N days after due, each enable/disable/changeable, with sensible defaults provided (e.g. 3 days before, on due date, 3 days after).
- **FR-043**: System MUST run a daily scheduled dispatch that finds every installment matching an active reminder rule, builds the guardian message, checks credit, sends via the provider, records the result, and decrements credit by segment count.
- **FR-044**: System MUST compose each reminder in Arabic containing student name, grade/level, due amount in SDG, due date, and school name (e.g. `تذكير: الطالب {الاسم} - {الصف}. قسط مستحق {المبلغ} ج.س بتاريخ {التاريخ}. {المدرسة}`).
- **FR-045**: System MUST skip and count students without a valid guardian phone number.
- **FR-046**: System MUST let a school admin or accountant send a manual reminder on demand to a specific student's guardian, subject to the same credit and logging rules.
- **FR-047**: System MUST send SMS through a single, swappable provider interface (send message → accepted/failed result and a provider message id), with exactly one provider adapter configured per deployment.
- **FR-048**: System MUST track each outbound message's delivery status (queued, sent/accepted, delivered, failed), updating from the provider's delivery report/webhook where available, consuming credit on provider acceptance and recording but not auto-refunding a later failure.
- **FR-049**: System MUST log every message (scheduled or manual) per school and viewable per student, including recipient number, student, message text, segment/credit count, status, and timestamp.

**In-app notifications**

- **FR-050**: System MUST provide an in-app notification center (bell) that surfaces payment recorded, low SMS credit, and subscription expiring soon to the relevant user, with no external delivery (no SMS, no push) for these notifications in this phase.

**Cross-cutting**

- **FR-051**: System MUST present every screen and printable document Arabic-only with full right-to-left layout, including numbers, dates, and currency formatting.
- **FR-052**: System MUST use Sudanese Pound (SDG) as the only currency (no multi-currency).
- **FR-053**: System MUST record the acting user and timestamp for every money event and every adjustment, keeping them immutable after posting (audit trail).

### Key Entities *(include if feature involves data)*

- **School (tenant)**: A customer school. Holds name, subscription period, SMS-credit balance, and lifecycle state; the isolation boundary for all data.
- **User**: A person with one role (super-admin, school admin, accountant, viewer). Belongs to exactly one school except the super-admin.
- **Academic Year**: A named year (e.g. 2025/2026) within a school; exactly one is current.
- **Stage**: One of three fixed levels (Primary/Middle/Secondary).
- **Grade**: A level under a stage (12 total), labelled in Arabic.
- **Section (شعبة)**: A class group under a grade; organizes students and reports, not money.
- **Student**: A profile (name, guardian name, guardian phone, optional photo, status).
- **Enrollment**: Ties a student to a grade+section for a specific academic year.
- **Account**: A money container of type cash or bank with an opening balance and optional account number; live balance is derived.
- **Fee Structure**: Per grade per year; lists fee items with amounts and an installment schedule.
- **Installment / Invoice**: A student-specific amount owed with a due date, generated from the fee structure; carries a running balance.
- **Discount / Scholarship / Waiver**: A non-cash reduction of a student's charge, attributable to a user.
- **Money Event**: The append-only audited record of a payment, expense, transfer, refund, or write-off/adjustment, referencing the account(s) it touched.
- **Receipt**: The printable artifact and sequential gapless receipt number tied to a fee payment.
- **Subscription**: The annual period (start/end) and lifecycle state of a school.
- **SMS Credit Ledger**: The school's credit balance plus logged top-ups and per-message decrements.
- **Reminder Rule**: A school's configuration of when reminders fire relative to due dates.
- **SMS Message Log**: An outbound message record (recipient, student, text, segment/credit count, status, timestamp, provider message id).
- **Notification**: An in-app notification item surfaced to a user.
- **Audit Entry**: The who/what/when attached to every money event and adjustment.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A super-admin can create a school, set its annual subscription, and add SMS credit, with the new school usable by its admin in under 5 minutes.
- **SC-002**: A school admin can set up a current academic year, grades, sections, at least one cash and one bank account with opening balances, and a per-grade per-year fee structure with installments, then enroll a student and see correctly generated installments — completing the first student's setup in under 15 minutes.
- **SC-003**: 100% of posted fee payments receive a sequential, gapless, never-reused receipt number unique within the school (zero gaps, zero reuse, zero duplicates across all payments).
- **SC-004**: After any sequence of money events, every account balance and every student balance equals the value derived purely from events (opening balance plus/minus events) — verified to the SDG with zero stored-figure drift.
- **SC-005**: 100% of posted money events are immutable and corrected only by reversing entries; no posted event can be silently edited or deleted.
- **SC-006**: A student statement and a printable receipt each render correctly in Arabic/RTL and export to PDF, with the statement's running balance and total owed matching the derived figures.
- **SC-007**: The receivables report places every unpaid student in the correct aging bucket and, when filtered by stage/grade/section, returns matching per-student amounts and per-bucket totals; it exports to a tabular format.
- **SC-008**: The dashboard shows every account balance, the combined total, all listed KPIs, the SMS credit balance, and the subscription countdown, each matching the derived underlying data.
- **SC-009**: On subscription expiry the school becomes read-only through the grace period and then view/export-only, with new money events and edits blocked 100% of the time in those states.
- **SC-010**: The daily dispatch sends Arabic reminders to guardians of all students with matching installments, decrements credit by actual segment count for every accepted message, skips 100% of students with no valid phone or when credit is insufficient, stops a depleted batch cleanly, and logs every message with a delivery status.
- **SC-011**: SMS credit never goes negative and is never double-charged, even under a batch that depletes it mid-run (atomic send-and-decrement holds in 100% of cases).
- **SC-012**: No action, query, or user in one school can read or modify another school's data — zero cross-tenant access in security verification.
- **SC-013**: Every screen and printable document is Arabic-only and fully right-to-left, with SDG as the only currency throughout.

## Assumptions

- **Receipt numbering scope**: Receipt numbers are continuous and gapless across the school's lifetime (not reset per academic year), unique within the school. A failed/aborted payment does not consume a number.
- **Payment allocation**: When a payment is recorded, the accountant selects the target installment(s); a sensible default applies it to the oldest outstanding installment first. Overpayment beyond an installment's remaining balance is prevented (a running balance never goes negative); excess must be applied to another installment or declined.
- **Corrections model**: All corrections (to payments, expenses, transfers, refunds, adjustments) are made by posting an explicit reversing entry; the original and the reversal both remain visible and audited.
- **SMS segment counting**: Arabic messages are Unicode-encoded; a segment is ~70 characters, so a typical reminder consumes ~2 credits. Credit is consumed on provider acceptance; a later failure is recorded and surfaced but does not auto-refund in this phase.
- **Reminders during lifecycle states**: Reminder visibility and the SMS log remain available in read-only/locked states; new money events and edits are blocked. (Whether scheduled dispatch continues to send during grace/locked is treated as a configuration concern to confirm at planning; the default assumption is that dispatch follows the same read/write gating as other write actions.)
- **Authentication**: Standard session-based authentication for web app users is assumed; method details are an implementation concern for planning. There is no parent/guardian login or portal (out of scope).
- **Default grace period**: The subscription grace period defaults to 14 days and is treated as a configurable default.
- **Reminder rule defaults**: Defaults of 3 days before, on the due date, and 3 days after are provided and can be changed or disabled per school.
- **Delivery (PWA, online-only)**: The product is an installable PWA that requires a connection to read and write; there is no offline data layer.
- **Provider choice**: The concrete SMS provider adapter is a planning-level (`/plan`) decision; exactly one is configured per deployment and the abstraction does not change behavior.
- **Out of scope (deferred)**: Web push / notifications to a closed app, parent/guardian login or portal, offline data use, and an automated year-end rollover wizard are out of scope for Phase 1 (the data model must support carrying outstanding balances forward, but a one-click promotion wizard is deferred).

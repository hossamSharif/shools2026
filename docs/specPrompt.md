 Phase 1: School Fee Accounting (System of Record)
 


Build the core of a multi-tenant SaaS that schools use to manage the accounting side
of student fees and school expenses. Each customer is a school (a tenant); a single
super-admin operator manages all schools. The product is Arabic-only with full
right-to-left (RTL) layout. Currency is Sudanese Pound (SDG) only — no multi-currency.

This phase delivers the **system of record**: the structure of the school, every way
money moves, the printable statements, the reports a bursar needs, the admin
dashboard, roles, the subscription and SMS-credit state, **and the reminder engine that
sends SMS to guardians**. Push notifications to a closed app are out of scope for this
phase (see Out of Scope).

## Who uses it (roles)

- **Super-admin (SaaS operator):** creates and manages school tenants, sets each
  school's annual subscription period, and adds SMS credit to a school's balance.
  Cannot see or edit the financial records inside a school.
- **School admin:** full access within their own school — structure, fees, money,
  reports, users, settings.
- **Accountant:** records money events (payments, expenses, transfers, refunds) and
  views reports within their school. Cannot change settings, fee structures, users,
  or the subscription.
- **Viewer:** read-only access to reports and statements within their school.

A user belongs to exactly one school (except the super-admin). A user never sees any
data belonging to another school.

## School structure (the spine)

- A school has one or more **academic years** (e.g. 2025/2026). Exactly one is
  marked *current*.
- A school has three fixed **stages**: Primary (الابتدائية), Middle (المتوسطة),
  Secondary (الثانوية).
- **Grades** sit under stages: Primary has 6 grades, Middle has 3, Secondary has 3
  (12 grades total). Grades are labelled in Arabic (الصف الأول الابتدائي … الصف
  الثالث الثانوي).
- Each grade can have one or more **sections/classes** (شعبة أ / ب / ج). Sections
  organize students and group reports; they do not affect money.
- A **student** has a profile (name, guardian name, guardian phone number, optional
  photo, status active/withdrawn/graduated).
- An **enrollment** ties a student to a grade + section within a specific academic
  year. Across years a student moves through grades. The guardian phone number is
  what future reminders will use.

## Money containers (accounts)

- Each school defines its own **accounts**. An account is either type **cash** or
  type **bank**. A school may have one or several cash accounts and any number of
  named bank accounts (e.g. "Bank of Khartoum", "Faisal Islamic Bank") each with an
  optional account number.
- Each account has an **opening balance** captured at onboarding.
- The live balance of any account is always derived from its opening balance plus the
  sum of every money event that touched it — it is never typed in or trusted as a
  stored figure.

## Fees

- A **fee structure** is defined per **grade, per academic year**: it lists one or
  more fee items (e.g. tuition, transport, books, exam, uniform) with amounts.
  Different grades can have different amounts; a school may also set the same amount
  across a stage by entering it per grade.
- Each fee structure is split into one or more **installments**, each with its own
  **due date**. The number of installments is flexible (a school may use 2, 3, or 10)
  — there is no forced term count.
- When a student is enrolled in a grade for a year, the matching fee structure
  produces that student's **invoices/installments** with due dates and amounts owed.

## Discounts, scholarships, and waivers

- A school can reduce what a specific student is charged via a **discount/scholarship**
  (percentage or fixed amount) or a **sibling waiver**. This reduces the amount owed —
  it is not a payment and does not move cash. It is recorded, attributable to a user,
  and visible on the student statement.

## How money moves (the complete, canonical set of money events)

Every money event is **append-only and audited** (who, what, when). Corrections are
made by reversing entries, never by silently editing or deleting a posted event. Every
event that touches an account references exactly one account.

1. **Fee payment (money in):** a guardian pays toward a student's installment(s).
   - Supports **partial payments** — many payments may apply to one installment/invoice,
     each reducing a running balance.
   - Records **which account received it** (cash or a specific bank).
   - Can carry an **attachment image** (photo of the bank slip or cash receipt).
   - Is issued a **sequential, gapless, never-reused receipt number** unique within the
     school.
   - Produces a printable receipt showing student, grade/section, amount, account,
     date, receipt number, and running balance.
2. **Expense (money out):** money leaves a chosen account, with a category, optional
   vendor, description, and optional **attachment image**.
3. **Inter-account transfer (neutral):** moves money between two of the school's own
   accounts (e.g. depositing the day's cash into a bank, or bank-to-bank). It is
   neither income nor expense and must keep both account balances correct.
4. **Refund (money out):** returns money to a guardian (e.g. a withdrawal). It reverses
   value previously paid and adjusts the student's ledger; it is not an expense.
5. **Write-off / adjustment:** the bursar forgives or corrects a student balance.
   Adjusts what the student owes; audited; never a silent edit.

(SMS-credit top-ups are tracked separately and are not a cash money event — see
Subscription & SMS credit.)

## Opening balances (onboarding mid-year)

- When a school joins partway through a year, it must be able to enter **starting
  balances**: the opening balance of each account, and each student's **outstanding
  balance** carried in (what they already owe). This lets a school switch over without
  losing history.

## Statements and reports

- **Student statement:** a clean, printable/exportable ledger for one student — all
  charges (installments), all discounts, all payments and refunds, with a running
  balance and the total still owed.
- **Receivables / unpaid report:** the bursar's core tool. Lists students who have not
  fully paid, as a proper **aging report** bucketed by how overdue they are
  (current / 1–30 / 31–60 / 61–90 / 90+ days), **filterable by stage, grade, and
  section**, showing amount owed per student and totals per bucket. Exportable.
- All key lists/reports are exportable (PDF for statements/receipts; tabular export for
  report data).

## Admin dashboard

The school admin home shows, at minimum:

- **Balance of every account** individually — total cash, and the balance of each bank
  account — plus a combined total.
- **Total collected** (this month and this academic year).
- **Total outstanding receivables.**
- **Collection rate** (collected ÷ charged).
- **Expenses** (this month) and **net cash flow.**
- **Count of students overdue.**
- **SMS credit remaining.**
- A pinned **subscription countdown** banner showing days remaining until the annual
  subscription expires.

## Subscription (annual)

- Each school has an **annual subscription period** set by the super-admin, with a
  start and end date.
- A **countdown** to expiry is shown pinned at the top of the school admin home.
- On expiry, the school enters a **grace period** (default 14 days) during which it
  becomes **read-only** (records can be viewed and exported, but no new money events or
  edits). After the grace period, the school is fully locked except for viewing/exporting
  its own records — a school never loses sight of its own ledger.

## SMS credit

- Each school has an **SMS credit balance**. The **super-admin can add credit** to any
  school. Every top-up is logged (amount, who, when).
- The balance and a **low-credit indicator/alert** are visible to the school admin.
- Every message sent **decrements the school's credit by the message's segment count**,
  not a flat 1 per message. Arabic SMS is Unicode-encoded, so a segment is ~70
  characters; a typical reminder is therefore ~2 segments = ~2 credits. The decrement
  and the send are a single atomic action so credit can never go negative or be charged
  twice under a batch.
- If a school's credit is insufficient to cover a message, that message is **not sent**;
  it is skipped and the school admin is alerted (low/zero-credit notification). A
  reminder batch that runs out of credit stops cleanly and reports how many were sent vs
  skipped.

## Reminders & SMS sending

Reminders are short Arabic SMS messages sent to a student's **guardian phone number**.

- **Message content:** student name, grade/level, the due amount in SDG, and the due
  date — and the school name. Example shape:
  `تذكير: الطالب {الاسم} - {الصف}. قسط مستحق {المبلغ} ج.س بتاريخ {التاريخ}. {المدرسة}`
- **Reminder rules (configurable per school):** the school admin sets when reminders
  fire relative to an installment's due date — any combination of *N days before due*,
  *on the due date*, and *N days after due (overdue)*. Sensible defaults are provided
  (e.g. 3 days before, on due date, 3 days after) and the school can change or disable
  each.
- **Scheduled dispatch:** a scheduled process runs daily, finds every installment whose
  state matches an active reminder rule, builds the message for that student's guardian,
  checks available credit, sends via the SMS provider, records the result, and decrements
  credit by segment count. Students without a valid guardian phone are skipped and counted.
- **Manual send:** a school admin or accountant can also send a reminder on demand to a
  specific student's guardian (e.g. a final notice), subject to the same credit and
  logging rules.
- **Provider abstraction:** SMS sending is performed through a single, swappable provider
  interface (send message → returns an accepted/failed result and a provider message id).
  Exactly one provider adapter is configured per deployment. The concrete provider is a
  `/plan`-level choice and does not change this behavior.
- **Delivery status:** each outbound message has a status — `queued`, `sent`
  (accepted by the provider), `delivered`, or `failed` — updated from the provider's
  delivery report/webhook where available. Default credit rule: credit is consumed when
  the provider **accepts** the message; a later `failed` status is recorded and surfaced
  but does not auto-refund (revisited once a provider is chosen).
- **SMS log:** every message (scheduled or manual) is logged per school and viewable per
  student — recipient number, student, message text, segment/credit count, status, and
  timestamp — so a bursar can prove a reminder was sent.

## In-app notifications (this phase)

- A simple in-app **notification center** (bell) surfaces events to the relevant user:
  payment recorded, low SMS credit, subscription expiring soon. No external delivery
  (no SMS, no push) in this phase.

## Cross-cutting requirements

- **Arabic-only, full RTL** across every screen, including numbers, dates, currency
  formatting (SDG), and printable documents.
- **Strict tenant isolation:** no user or query can reach another school's data.
- **Audit trail:** every money event and every adjustment records the acting user and
  timestamp and is immutable after posting.
- **Derived balances:** account balances and student balances are always computed from
  events, never stored as an editable figure.

## Out of scope for Phase 1 (explicitly deferred)

- Web push / notifications to a closed app — later phase.
- Parent/guardian login or portal — excluded from the product entirely.
- Offline data use — the app is an installable PWA but requires a connection to read
  and write; there is no offline data layer.
- Automated year-end rollover wizard — the data model must *support* carrying
  outstanding balances forward, but a one-click promotion wizard is a later phase.

## Acceptance criteria (Phase 1 is done when)

- A super-admin can create a school, set its annual subscription, and add SMS credit.
- A school admin can set up academic years, grades, sections, accounts (cash + banks
  with opening balances), and per-grade per-year fee structures with installments.
- Students can be enrolled into a grade+section for a year, generating their
  installments with due dates.
- An accountant can record a partial fee payment against an installment, choose the
  receiving account, attach an image, and get a sequential receipt number and a
  printable receipt; the student's running balance and the account balance both update
  correctly and only via the posted event.
- Expenses, inter-account transfers, refunds, and write-offs/adjustments can each be
  recorded against the correct account(s), audited, and reflected in balances.
- A student statement prints with a correct running balance.
- The receivables report shows unpaid students aged into buckets and filters by stage,
  grade, and section.
- The dashboard shows each account's balance, the listed KPIs, the SMS credit balance,
  and the subscription countdown.
- On subscription expiry the school becomes read-only through a grace period, then
  view/export-only.
- A school admin can configure reminder rules (before/on/after due date), and the daily
  dispatch sends Arabic SMS reminders to guardians of students with matching installments,
  decrementing credit by segment count, skipping students with no valid phone or when
  credit is insufficient, and logging every message with a delivery status.
- A school admin or accountant can send a manual reminder to one guardian, with the same
  credit and logging behavior.
- No action in one school can read or modify another school's data.
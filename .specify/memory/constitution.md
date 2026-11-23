<!--
SYNC IMPACT REPORT
==================
Version change: 1.1.0 → 1.2.0
Bump type: MINOR — scope expansion from fee accounting to a full school-management SaaS.
  New articles added and Article VII materially expanded. No article was removed or
  redefined; Articles I–XIII and their guarantees are not weakened in any way.

Product renamed:
- "School Fee Accounting SaaS" → "ITLINK School — School Management SaaS"

Modified principles:
- VII. Credit and Messaging Integrity — expanded (not renamed): ALL outbound SMS
  (reminders, attendance, announcements, results, admissions) MUST use the same
  credit + dispatch path. Existing bullets unchanged.
- Articles I–VI, VIII–XIII — unchanged (text preserved verbatim).

Added sections:
- XIV.   Role- and Relationship-Scoped Access
- XV.    Academic Record Integrity
- XVI.   Minors' Privacy
- XVII.  The Public Surface
- XVIII. Mobile-First Portal Budget
- Preamble "Scope" note (v1.2.0)

Removed sections: none.

Superseded decisions:
- docs/specPrompt.md ("Out of scope for Phase 1": "Parent/guardian login or portal —
  excluded from the product entirely") is SUPERSEDED by this amendment. Guardian and
  student portals are now in product scope, governed by Articles XIV, XV, XVI and XVIII.
  The same exclusion restated in specs/001-fee-accounting/spec.md (Assumptions →
  Authentication / Out of scope) remains a valid scope boundary for feature 001 only;
  it is no longer a product-wide decision.

Templates requiring updates:
- .specify/templates/plan-template.md ✅ updated — Constitution Check now lists
  explicit gates for Articles I–XVIII (incl. XIV role/relationship RLS matrix, XV
  audit/lock/publish, XVI minors' data, XVII anonymous surface, XVIII page-weight
  budget + slow-3G Playwright check) and Security/Git gates.
- .specify/templates/spec-template.md ✅ updated — added "Access, Privacy & Public
  Surface" requirements prompts (Art. XIV–XVIII) and SMS path note (Art. VII).
- .specify/templates/tasks-template.md ✅ updated — Foundational phase examples now
  include per-table role/relationship RLS + GRANT tasks, audit triggers, private
  storage/signed URLs; Polish phase includes RLS role-matrix tests, publish-gate
  tests, and 360px / slow-3G page-weight Playwright checks.
- .specify/templates/checklist-template.md ✅ reviewed — generic; no change needed.
- .specify/templates/constitution-template.md ✅ unchanged (source template).
- .claude/skills/speckit-*/SKILL.md ✅ reviewed — generic references to "constitution";
  no article-specific or stale references.

Runtime / guidance docs:
- docs/specPrompt.md ⚠ not edited (historical input prompt) — portal exclusion is
  superseded per above; future spec prompts MUST NOT reuse it as a product rule.
- docs/plans.md ⚠ "Notes for the Constitution Check" lists Articles I–XIII only (it is
  the 001 plan prompt). Future plan prompts MUST cover XIV–XVIII.
- docs/connistitMd ⚠ original source text (v1.1.0) — kept as historical source; the
  canonical constitution is this file.
- specs/001-fee-accounting/plan.md ⚠ Constitution Check written against 1.1.0. Re-check
  against XIV is recommended: finance tables readable only by school_admin, accountant,
  viewer; no school-wide policy granted merely for being "authenticated". (001 already
  uses roles super_admin | school_admin | accountant | viewer.)

Follow-up TODOs: none. No unexplained bracket tokens remain.
-->

# ITLINK School — School Management SaaS — Constitution

> Theme: **financial integrity first**. In an accounting product a single violated
> invariant silently corrupts a school's books. Principles marked **(Choice)** reflect a
> deliberate decision rather than a hard law and may be changed by the owner.
>
> **Scope (v1.2.0):** the product is a full school-management SaaS — finance, academics,
> attendance, messaging, guardian/student portals, and a public school website. Financial
> integrity remains first; Articles XIV–XVIII extend the same discipline to who may see
> what, academic records, minors' data, the anonymous surface, and mobile portals.

## Core Principles

## Article I — Financial Integrity Is Non-Negotiable

Every operation that changes money happens **inside a single database transaction**,
implemented as a database function — never split across application code, route
handlers, or the worker.

- The money-mutating operations are: apply a fee payment, record an expense, record an
  inter-account transfer, record a refund, record a write-off/adjustment, decrement SMS
  credit on send, and top up SMS credit.
- Monetary amounts are stored as **`NUMERIC(14,2)`** in **SDG**. Floating-point types are
  forbidden for money anywhere — database, API, or UI math.
- A **sequential, gapless, per-school receipt number** is assigned to each fee payment
  **by the database, inside the payment transaction**. Never generated in application
  code, never reused, never reset.
- Every money event references exactly one **account**, an **acting user**, and a
  **timestamp**.
- Every money-submitting and message-sending operation carries an **idempotency key**, so
  a retry or double-click can never post a transaction or charge credit twice.

## Article II — Balances Are Derived, Never Trusted

- **Account balance** = opening balance + Σ(events touching that account).
- **Student balance** = charges (installments) − discounts − payments − write-offs +
  refunds.
- **(Choice — compute-on-read first.)** Balances are computed from events on read. A
  running-balance cache is introduced **only if a query is measured slow**, and if
  introduced it is maintained exclusively by database triggers and must reconcile exactly
  to the event sum. Application code never writes a balance.

## Article III — The Ledger Is a Typed, Append-Only Event Log

**(Choice — typed single-entry, not full double-entry.)**

- Canonical money-event types are the complete set: fee payment, expense, inter-account
  transfer, refund, write-off/adjustment, discount/scholarship (reduces charge, not a cash
  event), and SMS-credit top-up (tracked separately from cash).
- Posted financial rows are **immutable**. Corrections are made by **reversing entries**,
  never by `UPDATE`/`DELETE` of a posted event.
- Financial rows are **never deleted**. Non-financial entities may be soft-deleted only.

## Article IV — Tenant Isolation Lives in the Database

- Every tenant-scoped table carries `school_id` and a **default-deny Row-Level Security
  policy**. Application-layer checks are defense-in-depth, not the primary boundary.
- The **super-admin** role is walled off from school financial records: it manages tenants,
  subscriptions, and SMS-credit top-ups, and cannot read a school's payments, expenses,
  statements, or balances.
- **New-table checklist (definition of done):** no table is "done" until it has `school_id`
  (if tenant-scoped), an RLS policy, and explicit `GRANT`s to the correct roles.

## Article V — Immutable Audit Trail

Every money event and every adjustment records the acting user, the action, and the
timestamp, and is immutable after posting — sufficient to answer "who recorded or reversed
this, and when" for any record. Preventing staff-side fee fraud is a primary reason this
software exists.

## Article VI — Service Boundaries: Where Logic Is Allowed to Live

- **Postgres (Supabase)** is the single source of truth for money and sequencing. All
  money math and receipt numbering live here.
- **Next.js (Vercel)** serves UI and light CRUD / read APIs. It contains **no money
  mutation logic** — it calls database functions.
- **Express worker (Fly.io)** owns the reminder scheduler, the SMS dispatch worker, and the
  provider delivery webhook. It is the only long-running process.
- **SMS sending is performed behind a single, swappable provider interface.** No provider
  SDK or quirk leaks into business logic; exactly one adapter is configured per deployment.

## Article VII — Credit and Messaging Integrity

- Sending a message and decrementing SMS credit are a **single atomic action**; credit can
  never go negative or be charged twice within a batch.
- Credit is decremented by the message's **segment count**, computed for Arabic Unicode
  (~70 characters/segment), not a flat 1 per message.
- Insufficient credit ⇒ message **skipped, not partially sent**, and the admin alerted. A
  batch that exhausts credit stops cleanly and reports sent-vs-skipped.
- Every message (scheduled or manual) is **logged** with recipient, student, text,
  segment/credit count, status, and timestamp.
- **One path for every SMS.** ALL outbound SMS — fee reminders, attendance alerts,
  announcements, results notifications, and admissions messages — go through the **same
  credit + dispatch path**: the atomic credit-decrement database function and the
  Article VI dispatch worker behind the single provider interface. No feature may send
  SMS through a separate route, call the provider directly, or bypass credit, segment
  counting, skip-on-insufficient, or logging.

## Article VIII — Time Is Africa/Khartoum

All timestamps are **stored in UTC** and **rendered in Africa/Khartoum (UTC+2)**. Due-date
evaluation and reminder-window logic are computed in the school timezone, so reminders fire
on the correct local day.

## Article IX — Arabic-RTL and SDG by Default

Arabic-only, full right-to-left layout across every screen, including numerals, dates,
currency formatting, and printable documents (receipts, statements, reports). Currency is
**SDG only**; no multi-currency code paths.

## Article X — Verification Standard ("The Gauntlet")

Passing unit tests alone does **not** mean a feature is done.

- A money feature is verified only by **live verification on a real Supabase instance**:
  exercised through the browser UI (via **Playwright**, Article XIII) and confirmed against
  actual rows (via **Supabase MCP**, Article XII).
- Every money feature includes a **reconciliation test**: a balance computed two
  independent ways (event sum vs. derived statement figure) must match exactly.
- Receipt-number issuance includes a **concurrency test**: parallel payment inserts must
  never produce a duplicate or a gap.
- Migrations are **forward-only** and reviewed; the Article IV new-table checklist is part
  of review.

## Article XI — Type Safety and Validation at the Boundaries

- TypeScript runs in **strict mode** across the monorepo.
- All external inputs — API requests, form submissions, provider webhooks — are validated
  with **Zod** at the boundary before reaching business logic.
- Shared domain types and money-event definitions live in the shared package as the single
  source of truth, imported by web, api, and database packages alike.

## Article XII — Database Operations via Supabase MCP (Mandatory)

**All database work is performed through the Supabase MCP tool suite** — never ad-hoc SQL
clients, raw connection strings, or out-of-band schema edits.

- **Schema & migrations:** use `apply_migration`, `list_migrations`, `list_tables`. All
  structure changes — tables, columns, indexes, RLS policies, **and the money functions /
  triggers from Articles I–IV** — ship as migrations via `apply_migration`.
- **Types:** use `generate_typescript_types` as the source of truth for the database/shared
  packages. Hand-written DB types that drift from the schema are forbidden.
- **Inspection & ops:** use the respective Supabase MCP tools for logs, advisors, storage,
  and auth — not direct dashboard edits that bypass version control.
- **Gauntlet row checks (Article X):** read actual rows via Supabase MCP to confirm a
  money operation produced the expected ledger state.
- **(Choice — human-in-the-loop gate for money migrations.)** A migration that creates or
  alters **money tables, money functions, the receipt-number sequence, or RLS policies**
  requires explicit owner review of the SQL **before** `apply_migration` runs.
  Non-financial migrations may be applied autonomously. Remove this gate only to accept
  full autonomy over financial schema changes.

## Article XIII — Browser Automation & Testing via Playwright (Mandatory)

**All UI testing, end-to-end flows, and visual verification are performed with Playwright.**
No other browser-automation tool is used.

- E2E coverage must include the money-critical paths: record a partial payment → receipt
  number issued → student balance and account balance update correctly; record expense /
  transfer / refund / adjustment → balances reconcile; reminder send → credit decrements by
  segment count → SMS log entry; subscription expiry → read-only mode then view/export-only.
- **RTL/Arabic assertions:** tests verify right-to-left layout and correct Arabic rendering
  on receipts and statements, since these are printed and customer-facing.
- Use explicit waits for content readiness before interacting; prefer accessibility-tree /
  role-based selectors over brittle CSS where possible.

## Article XIV — Role- and Relationship-Scoped Access

Tenant isolation (Article IV) is **necessary but not sufficient**. Every table's RLS policy
MUST also encode **who within a school** may read and write it.

- **Trusted staff roles** MAY have school-wide read only where their duties require it, and
  the plan states which roles and why.
- **Teachers** are scoped to the sections/subjects they are **allocated** to; they cannot
  read or write records of other sections or subjects.
- **Guardians** are scoped to the students they are **linked** to; **students** are scoped
  to themselves.
- **No policy may grant school-wide access merely for being `authenticated`.** A policy
  whose only predicate is "is a logged-in member of this school" is a violation.
- **Finance tables** (money events, accounts, installments, statements, receipts, SMS
  credit) are readable **only by `school_admin`, `accountant`, and `viewer`**. The single
  exception is a guardian's read of **their own linked students' statement**, served
  through a **dedicated database function** that checks the guardian–student link; guardians
  never receive direct table access to finance tables.
- Article IV's new-table checklist is extended: a table is not "done" until its plan
  includes a **role × relationship access matrix** and RLS tests proving each denied case.

## Article XV — Academic Record Integrity

- **Marks, attendance, and published results are audited**: every change records who, when,
  and the **old → new** value, immutably (consistent with Article V).
- **Marks are locked after approval.** A locked mark changes only through an **authorized,
  audited correction** (permitted role, mandatory reason, old → new recorded); direct
  `UPDATE` of a locked mark is rejected by the database.
- **Results are invisible to guardians and students until an explicit publish action.**
  Before publish, guardian/student access returns nothing; publish and unpublish are
  themselves audited.
- **Totals, averages, and grades are always computed from stored marks**, by a single
  database-side definition (view or function) — never typed in or stored as an editable
  value. Any persisted snapshot is produced by that computation and must reconcile to it
  exactly.

## Article XVI — Minors' Privacy

- **Student personal data is never exposed on public pages** (Article XVII surface).
- **Images of students on the gallery or public website require recorded guardian
  consent**; content without a consent record cannot be published.
- **Medical notes are visible only to roles explicitly permitted** in the spec/plan, enforced
  by RLS (Article XIV) — not by hiding fields in the UI.
- **Documents and photos live in tenant-scoped private storage** and are served only via
  **short-lived signed URLs** (expiry stated in the plan). Public buckets are forbidden for
  student documents and photos.

## Article XVII — The Public Surface

- The **public website** and the **anonymous admission form** are the **only anonymous
  surface** of the product.
- Anonymous visitors can **read only content a school explicitly published**, and can
  **only create** admission applications and contact messages.
- Anonymous writes go through a **validated (Zod, Article XI), rate-limited,
  spam-protected intake**; the plan names the rate limit and spam control.
- **Anonymous access never touches tenant tables directly**: no `anon` grants or RLS
  policies on tenant tables. Published content is served through a dedicated published
  read path, and intake through a dedicated function/endpoint.

## Article XVIII — Mobile-First Portal Budget

- **Guardian and student pages work at 360px width** (no horizontal scroll, no clipped
  controls, RTL intact per Article IX).
- Each plan that adds guardian/student pages **defines a page-weight budget** for them, and
  each such page is **verified with Playwright on a throttled slow-3G profile** against
  that budget (Article XIII).

## Security & Secrets

**Never hard-code keys, secrets, or sensitive environment values.** All such values are
provided as environment variables and documented (what each env is, where it is required)
in setup manifests. This applies to Supabase service keys, the SMS provider credentials,
and any worker secrets.

## Git Commit Discipline

- Commit all code and asset changes to the active feature branch immediately after a task
  completes, with a clear message summarizing the change.
- No completed work is left uncommitted. Work is organized in feature branches per the
  plan/task structure.
- If a commit cannot be made (merge conflict, missing git context), **halt and raise for
  human attention** rather than proceeding.

## Enforcement & Governance

- **Scoped MCP mandate.** Where an MCP exists for a domain, it is mandatory: **database →
  Supabase MCP (Article XII); browser testing → Playwright (Article XIII).** Operations
  with no MCP — notably the **SMS provider** — use the Article VI swappable interface, and
  doing so is **not** a violation.
- **This constitution supersedes other practices.** Deviation requires owner approval and a
  version bump (semantic versioning). Amendments document rationale, impact, and any
  migration plan.
- **All reviews verify compliance.** Any complexity beyond the mandated tools must be
  justified: why the mandated approach is insufficient, what simpler alternative was
  rejected, and the security/maintenance implications.

**Version**: 1.2.0 | **Ratified**: 2025-12-13 | **Last Amended**: 2026-11-23

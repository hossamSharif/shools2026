# Phase 0 Research: School Fee Accounting

All Technical Context fields were supplied resolved by the plan input. This document records
the decisions, rationale, and rejected alternatives for the choices that carry the most
constitutional weight. **There are no open NEEDS CLARIFICATION items.**

---

## 1. Receipt-number generation (gapless, per-school, never reused)

- **Decision**: A per-school counter row (`receipt_counter(school_id, next_value)`) locked
  with `SELECT … FOR UPDATE` inside the `apply_fee_payment` transaction; the number is read,
  incremented, and the payment posted in the same transaction.
- **Rationale**: Article I requires the number to be assigned by the database inside the
  payment transaction, gapless, never reused. A row lock serializes concurrent inserts per
  school so two payments can never read the same value, and because the increment commits
  with the payment, a rolled-back payment consumes no number (Edge case: "Receipt numbering
  integrity").
- **Alternatives rejected**:
  - *Postgres `SEQUENCE`*: sequences are not gapless (a rolled-back txn burns the value) and
    are not naturally per-school. Rejected — violates the gapless guarantee.
  - *Application-side counter*: forbidden by Article I (never generated in app code).
  - *`max(receipt_no)+1` without a lock*: race-prone under concurrent inserts. Rejected.

## 2. Money mutations as Postgres functions invoked via RPC

- **Decision**: Each money operation is a `SECURITY DEFINER` (or RLS-respecting) Postgres
  function shipped via migration, called from `@erp/web` server actions / route handlers via
  Supabase RPC. The function does all math, writes the event + audit entry, and (for
  payments) assigns the receipt number — all in one transaction.
- **Rationale**: Articles I & VI — money math lives only in Postgres; the web tier calls
  functions and contains no money math. Single-transaction guarantees atomicity for
  multi-row effects (event + installment running-balance check + receipt # + audit).
- **Alternatives rejected**: Edge Functions / TypeScript service doing multi-statement
  writes — splits a money operation across app code (Article I violation) and risks partial
  posts.

## 3. Derived balances (compute-on-read first)

- **Decision**: Account balance = opening + Σ(events touching it); student balance = charges
  − discounts − payments − write-offs + refunds. Implemented as SQL views / aggregate
  queries. No stored balance column.
- **Rationale**: Article II. Compute-on-read is correct-by-construction and simplest at Phase
  1 scale (~2,000 students/school; ≤3 s targets are reachable with proper indexes on
  `(school_id, account_id)` and `(school_id, student_id)`).
- **Alternatives rejected**: Materialized running-balance cache up front — Article II permits
  it *only if a query is measured slow*, and only maintained by DB triggers reconciling to the
  event sum. Deferred until measured.

## 4. Reversing-entry correction model

- **Decision**: Posted financial rows are immutable; a correction posts a new event with
  `reverses_event_id` pointing at the original; both remain visible and audited.
- **Rationale**: Articles III & V — no `UPDATE`/`DELETE` of posted events; full audit of who
  reversed what and when (Edge case: "Reversal of a wrong event").
- **Alternatives rejected**: Soft-deleting or editing the original row — forbidden for
  financial rows.

## 5. Tenant isolation via default-deny RLS

- **Decision**: Every tenant table carries `school_id` with a default-deny RLS policy keyed
  to the authenticated user's school (resolved from a `user_school` mapping). Explicit GRANTs
  per role. Super-admin policies exclude financial tables entirely.
- **Rationale**: Article IV — DB-layer isolation is the primary guarantee; app-layer scoping
  is defense-in-depth (FR-002). Super-admin must never read school financials (FR-003).
- **Alternatives rejected**: App-layer-only scoping — a crafted query could cross tenants;
  rejected as the primary boundary (Edge case: "Tenant isolation breach attempt").

## 6. Atomic, segment-counted SMS credit

- **Decision**: `consume_sms_credit(school_id, segments, …)` decrements credit and records
  the consumption in the same transaction as the send acknowledgement; segment count is
  computed for Arabic Unicode (~70 chars/segment) in `@erp/shared` and passed in. Insufficient
  credit ⇒ no send, skip + alert; a depleted batch stops cleanly and reports sent-vs-skipped.
- **Rationale**: Article VII; FR-039/040/041. Atomicity prevents negative balance and
  double-charge; segment counting prevents undercharging multi-segment Arabic messages (Edge
  case: "SMS segment edge", "Credit exhaustion mid-batch").
- **Alternatives rejected**: Flat 1-credit/message — undercounts Arabic. Decrement-then-send
  (or send-then-decrement) as two steps — can double-charge or go negative on retry.

## 7. SMS provider abstraction (resolved, not open)

- **Decision**: `SmsProvider` interface in `@erp/shared`:
  `send(message) → { providerMessageId, status: 'accepted' | 'failed' }`, plus a webhook
  status normalizer. Phase 1 ships one `GenericHttpSmsProvider` (HTTP POST + normalizer);
  exactly one adapter configured per deployment via env. The concrete Sudanese/regional
  vendor is swapped in later without touching business logic.
- **Rationale**: Article VI; FR-047. This is explicitly a **resolved** decision per the plan
  input — interface + placeholder — so no provider clarification is open.
- **Alternatives rejected**: Coding directly against a specific vendor SDK — leaks provider
  quirks into business logic (Article VI violation).

## 8. Time handling — Africa/Khartoum

- **Decision**: Store all timestamps as `timestamptz` (UTC); compute due-date and
  reminder-window logic in `Africa/Khartoum` (UTC+2); render with date-fns tz support.
- **Rationale**: Article VIII; reminders must fire on the correct local day (FR-043).
- **Alternatives rejected**: Storing local time or naive timestamps — ambiguous, breaks
  reminder windows.

## 9. Arabic-RTL, SDG, and PDF rendering

- **Decision**: next-intl Arabic locale with `dir="rtl"`; Arabic numerals/dates/currency
  formatting; `@react-pdf/renderer` (+ react-to-print) RTL templates for statements/receipts;
  SDG as the only currency.
- **Rationale**: Article IX; FR-051/052; SC-006/013. Printed docs are customer-facing and
  must render RTL Arabic correctly (Article XIII RTL assertions).
- **Alternatives rejected**: LTR-with-flip CSS hacks — unreliable for numerals/currency in
  print; multi-currency code paths — forbidden.

## 10. PWA installable-only (no offline data layer)

- **Decision**: Serwist for manifest + service worker providing installability and static
  caching only. No Dexie / idb-keyval / TanStack persist.
- **Rationale**: Plan input + Assumption "Delivery (PWA, online-only)". A money system of
  record requires a live connection for read/write integrity.
- **Alternatives rejected**: Offline write queue — risks divergent/stale money state; out of
  scope for Phase 1.

## 11. Tooling: Supabase MCP for DB, Playwright for browser

- **Decision**: All schema/migrations/types via Supabase MCP (`apply_migration`,
  `generate_typescript_types`, `list_tables`); money-table/function/receipt-sequence/RLS
  migrations flagged for owner review before apply. All E2E/RTL/visual via Playwright only.
- **Rationale**: Articles XII & XIII (mandatory, scoped). Vitest covers unit/integration incl.
  the Postgres money functions.
- **Alternatives rejected**: Ad-hoc SQL clients / dashboard edits (Article XII violation); any
  non-Playwright browser tool (Article XIII violation).

## 12. Monorepo tooling

- **Decision**: pnpm workspaces + Turborepo, `workspace:*` deps, five `@erp/*` packages
  matching the existing layout.
- **Rationale**: Plan input; clean separation of the Article VI service boundaries; shared
  types from one source (Article XI).
- **Alternatives rejected**: Single Next.js app holding worker + DB logic — collapses service
  boundaries and would put money/long-running logic in the wrong tier.

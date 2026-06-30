# `/speckit.plan` input — Phase 1: School Fee Accounting

> Run on branch `001-fee-accounting`. Paste everything below as the argument to
> `/speckit.plan`. It supplies the Technical Context the plan template expects and the
> architecture constraints that keep the plan aligned with the constitution.

---

Build this as a **TypeScript monorepo** matching the existing `@erp/*` package layout
(`workspace:*` deps). Packages: **`@erp/web`** (Next.js 14 App Router on Vercel),
**`@erp/api`** (Express worker on Fly.io), **`@erp/database`** (Supabase migrations, SQL
functions, triggers, RLS policies, seeds, generated types), **`@erp/shared`** (domain
types, Zod schemas, the money-event type definitions, the SmsProvider interface), and
**`@erp/ui`** (shared components). Use pnpm workspaces + Turborepo. There is **no offline
data layer** — do not add Dexie, idb-keyval, or TanStack persist; the PWA is
installable-only.

## Technical Context (fill the plan template with these)

- **Language/Version:** TypeScript 5.x (strict mode), Node.js 20, React 18.
- **Primary Dependencies:** Next.js 14 (App Router); `@supabase/supabase-js` +
  `@supabase/ssr`; TanStack Query v5; TanStack Table + Virtual; react-hook-form + Zod +
  `@hookform/resolvers`; Radix UI primitives with the shadcn/ui pattern; Tailwind CSS +
  tailwind-merge + class-variance-authority; **next-intl for Arabic/RTL**;
  `@react-pdf/renderer` + react-to-print for statements/receipts; lucide-react; date-fns
  (with timezone support). Worker: Express 4 + helmet + cors + express-rate-limit; Zod
  shared from `@erp/shared`. PWA: Serwist (manifest + service worker for installability
  and static caching only).
- **Storage:** Supabase Postgres (single relational database, per-tenant indexing);
  Supabase Storage for money-event attachments (bucket holds bytes; the event row stores
  only a path/key reference; JPEG/PNG/WebP/PDF, ~5 MB max, tenant-scoped). Supabase Auth
  for session-based authentication.
- **Testing:** Vitest for unit/integration (including tests of the Postgres money
  functions); **Playwright for all E2E, RTL/visual, and UI verification** (constitution
  Article XIII). No other browser-automation tool.
- **Target Platform:** Web, installable PWA. Next.js deployed on Vercel; Express worker
  on Fly.io; Supabase (managed Postgres + Auth + Storage).
- **Project Type:** Web application — multi-package monorepo (frontend + worker + shared
  database/domain packages).
- **Performance Goals:** interactive screens (dashboard, receivables report, statement
  view) ≤3 s; PDF export ≤5 s; at ~2,000 students/school under normal load.
- **Constraints:** Arabic-only, full RTL (UI, numerals, dates, currency, printed docs);
  SDG only; Africa/Khartoum timezone (store UTC, compute/render in school tz); money as
  `NUMERIC(14,2)`, never float; tenant isolation via default-deny RLS keyed to the user's
  school; idempotency keys on all money-submitting and message-sending operations.
- **Scale/Scope:** ~100 schools, up to ~2,000 students/school; 9 user stories and the
  entity set defined in the spec; no sharding/partitioning in Phase 1.

## Architecture — where logic is allowed to live (enforces the constitution)

**All money mutation logic lives in Postgres functions, not TypeScript.** Implement these
as database functions shipped via migration and invoked via Supabase RPC, each running as
a single transaction:

- `apply_fee_payment` — applies a (partial) payment to installment(s), oldest-outstanding
  first by default; prevents an installment running balance from going negative; assigns
  the next **per-school, gapless, never-reused receipt number** inside the same
  transaction (per-school sequence or locked counter — must hold under concurrent
  inserts); writes the audit entry.
- `record_expense`, `record_transfer`, `record_refund`, `record_adjustment` — each posts
  an append-only, audited money event referencing the correct account(s).
- `apply_discount` — non-cash reduction of a student's charge, audited.
- `topup_sms_credit` (super-admin) and `consume_sms_credit` — credit decrement is atomic
  with the send and **decrements by Arabic/Unicode segment count** (~70 chars/segment);
  credit can never go negative or be charged twice.

Posted financial rows are immutable; corrections are **reversing entries** only. Balances
(account and student) are **always derived from events** — no stored editable balance.

**`@erp/web` (Next.js/Vercel):** UI, read queries (TanStack Query over Supabase), light
CRUD, and calls to the RPC functions above. **No money math in JS.** Server actions /
route handlers validate input with Zod, then call the database functions. Subscription
lifecycle (active / grace / locked) gates writes in the UI **and** is enforced at the DB
layer.

**`@erp/api` (Express/Fly.io):** the only long-running process. Owns (1) the **daily
reminder cron** that finds installments matching active reminder rules in each school's
timezone, (2) the **SMS dispatch worker** that builds the Arabic message, checks credit,
calls the provider adapter, and calls `consume_sms_credit` atomically with the send,
skipping students with no valid phone or insufficient credit and reporting sent-vs-skipped,
and (3) the **provider delivery webhook** that normalizes callbacks into the SMS log's
status field. Dispatch is **paused** for schools in grace or locked state.

**SMS provider abstraction:** define `SmsProvider` in `@erp/shared`
(`send(message) → { providerMessageId, status: accepted | failed }`). Configure **exactly
one adapter per deployment** via env. For Phase 1 implement a single placeholder
`GenericHttpSmsProvider` (HTTP POST + a webhook status normalizer); the concrete Sudanese/
regional vendor is swapped in later without touching business logic. Treat this as a
**resolved** decision (interface + placeholder), not an open clarification.

**`@erp/database`:** carries the real weight — migrations for every table with
`school_id` + RLS policy + explicit GRANTs, the money functions/triggers above, the
receipt-number mechanism, the fixed stages/grades seed (Primary 6 / Middle 3 / Secondary
3, Arabic labels), and Supabase-MCP-generated TypeScript types consumed by the other
packages. **All schema and migrations go through Supabase MCP** (`apply_migration`,
`generate_typescript_types`, `list_tables`) per constitution Article XII. Migrations that
create or alter money tables, money functions, the receipt sequence, or RLS policies are
flagged for owner review before `apply_migration` (Article XII human-in-the-loop gate).

## Contracts to generate

- **RPC contracts:** signature + Zod input/output schema for each money function and for
  `consume_sms_credit` / `topup_sms_credit`.
- **Worker endpoints:** the provider delivery webhook (inbound) and any internal
  dispatch-trigger endpoint, with their request/response schemas.
- **Storage contract:** the attachment bucket layout and the tenant-scoped access rule.

## Notes for the Constitution Check

The plan must show: money math in Postgres (Art. I/VI), derived balances (Art. II),
append-only typed ledger (Art. III), DB-layer RLS tenant isolation (Art. IV), atomic
segment-counted credit (Art. VII), Africa/Khartoum time (Art. VIII), Arabic-RTL + SDG
(Art. IX), the Gauntlet verification approach with reconciliation + receipt-number
concurrency tests (Art. X), Zod-at-boundaries + strict TS (Art. XI), Supabase MCP for all
DB work (Art. XII), and Playwright for all browser tests (Art. XIII). If any cannot be
satisfied, surface it rather than silently working around it.
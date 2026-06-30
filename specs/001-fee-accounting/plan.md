# Implementation Plan: School Fee Accounting (System of Record)

**Branch**: `001-fee-accounting` | **Date**: 2026-07-01 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-fee-accounting/spec.md`

## Summary

A multi-tenant, Arabic-only / full-RTL SaaS that is the **system of record** for Sudanese
school fees and expenses: school spine (years, fixed stages/grades, sections, accounts,
fee structures), enrollment-driven student installments, the canonical append-only money
events (payment, expense, transfer, refund, write-off/adjustment, discount), gapless
per-school receipt numbering, printable statements/receipts, the receivables aging report,
the admin dashboard, the four-role access model, subscription lifecycle (active → grace →
locked), SMS-credit state, and a daily reminder engine that sends Arabic SMS to guardians.

**Technical approach:** a TypeScript monorepo (`pnpm` + Turborepo) matching the existing
`@erp/*` layout. **All money mutation and receipt sequencing live in Postgres functions**
(Supabase), invoked via RPC and each running as a single transaction; balances are always
derived from events, never stored. `@erp/web` (Next.js 14 on Vercel) is UI + read queries +
light CRUD with **no money math in JS**. `@erp/api` (Express on Fly.io) is the only
long-running process and owns the reminder cron, the SMS dispatch worker, and the provider
delivery webhook. `@erp/database` carries migrations, RLS, the money functions, the
receipt mechanism, seeds, and MCP-generated types. `@erp/shared` holds domain types, Zod
schemas, money-event definitions, and the `SmsProvider` interface; `@erp/ui` holds shared
components. The PWA is **installable-only** — no offline data layer.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode), Node.js 20, React 18.
**Primary Dependencies**: Next.js 14 (App Router); `@supabase/supabase-js` + `@supabase/ssr`;
TanStack Query v5; TanStack Table + Virtual; react-hook-form + Zod + `@hookform/resolvers`;
Radix UI primitives (shadcn/ui pattern); Tailwind CSS + tailwind-merge +
class-variance-authority; **next-intl (Arabic/RTL)**; `@react-pdf/renderer` + react-to-print;
lucide-react; date-fns (+ tz). Worker: Express 4 + helmet + cors + express-rate-limit; Zod
from `@erp/shared`. PWA: Serwist (manifest + service worker for installability and static
caching only).
**Storage**: Supabase Postgres (single relational DB, per-tenant indexing); Supabase Storage
for money-event attachments (bucket holds bytes; the event row stores only a path/key;
JPEG/PNG/WebP/PDF, ~5 MB max, tenant-scoped). Supabase Auth for session-based auth.
**Testing**: Vitest for unit/integration (incl. tests of the Postgres money functions);
**Playwright for all E2E, RTL/visual, and UI verification** (Article XIII). No other
browser-automation tool.
**Target Platform**: Web, installable PWA. Next.js on Vercel; Express worker on Fly.io;
Supabase (managed Postgres + Auth + Storage).
**Project Type**: Web application — multi-package monorepo (frontend + worker + shared
database/domain packages).
**Performance Goals**: interactive screens (dashboard, receivables report, statement view)
≤3 s; PDF export ≤5 s; at ~2,000 students/school under normal load.
**Constraints**: Arabic-only, full RTL (UI, numerals, dates, currency, printed docs); SDG
only; Africa/Khartoum timezone (store UTC, compute/render in school tz); money as
`NUMERIC(14,2)`, never float; tenant isolation via default-deny RLS keyed to the user's
school; idempotency keys on all money-submitting and message-sending operations.
**Scale/Scope**: ~100 schools, up to ~2,000 students/school; 9 user stories and the entity
set in the spec; no sharding/partitioning in Phase 1.

_No open NEEDS CLARIFICATION: all Technical Context fields are resolved by the plan input,
and the SMS provider is a resolved decision (interface + `GenericHttpSmsProvider`
placeholder), not an open question._

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Article | Requirement | How the plan satisfies it | Status |
|---|---|---|---|
| I — Financial Integrity | Money mutations are single DB-transaction functions; `NUMERIC(14,2)`; gapless per-school receipt # in-txn; idempotency keys | `apply_fee_payment`, `record_expense`, `record_transfer`, `record_refund`, `record_adjustment`, `apply_discount`, `topup_sms_credit`, `consume_sms_credit` as Postgres functions; receipt # from a per-school locked counter inside `apply_fee_payment`; `idempotency_key` arg on every money/message function | PASS |
| II — Derived Balances | Account & student balances computed from events; no stored editable balance | Balances are views/derived queries over the event log; compute-on-read first; no balance column written by app | PASS |
| III — Append-Only Typed Ledger | Canonical typed event set; immutable; corrections by reversing entry | Single `money_event` family with a typed discriminator; posted rows immutable; `reverses_event_id` reversing entries; financial rows never deleted | PASS |
| IV — Tenant Isolation in DB | `school_id` + default-deny RLS + GRANTs; super-admin walled off from financials | Every tenant table carries `school_id`, default-deny RLS keyed to `auth.uid()→school`, explicit GRANTs; super-admin policies exclude financial tables | PASS |
| V — Immutable Audit Trail | who/what/when on every money event & adjustment | `audit_entry` (actor, action, timestamp) written inside each money function; immutable | PASS |
| VI — Service Boundaries | Money math only in Postgres; Next.js = UI + light CRUD; Express = worker; SMS behind one swappable interface | `@erp/web` calls RPC only; `@erp/api` owns cron/dispatch/webhook; `SmsProvider` interface in `@erp/shared`, one adapter per deployment | PASS |
| VII — Credit & Messaging Integrity | Atomic send+decrement; segment-count decrement; skip on insufficient; logged | `consume_sms_credit` decrements by segment count atomically with the send; insufficient ⇒ skip + alert; batch stops cleanly; every message logged | PASS |
| VIII — Africa/Khartoum Time | Store UTC, render/compute in school tz | `timestamptz` UTC storage; due-date & reminder-window logic computed in `Africa/Khartoum`; render via date-fns tz | PASS |
| IX — Arabic-RTL & SDG | Arabic-only RTL everywhere incl. print; SDG only | next-intl Arabic locale, `dir="rtl"`, Arabic numerals/dates/currency; PDF templates RTL; single SDG currency | PASS |
| X — The Gauntlet | Live verification on real Supabase via Playwright + MCP row checks; reconciliation test; receipt-# concurrency test; forward-only migrations | Quickstart defines reconciliation (event-sum vs statement) and parallel-insert receipt-# concurrency tests; E2E via Playwright; rows confirmed via Supabase MCP | PASS |
| XI — Type Safety & Validation | Strict TS; Zod at all boundaries; shared types as SoT | Strict mode monorepo-wide; Zod validates RPC inputs, form submissions, provider webhooks; `@erp/shared` is the single type source | PASS |
| XII — Supabase MCP for DB | All schema/migrations/types via MCP; human-in-the-loop gate for money migrations | `apply_migration`, `generate_typescript_types`, `list_tables` for all DB work; migrations touching money tables/functions/receipt sequence/RLS flagged for owner review before `apply_migration` | PASS |
| XIII — Playwright for Browser | All E2E/RTL/visual via Playwright only | Playwright is the sole browser tool; covers money-critical paths + RTL/Arabic assertions on receipts/statements | PASS |

**Security & Secrets**: Supabase service keys, SMS provider credentials, worker secrets are
env-only and documented in the quickstart manifest — never hard-coded.
**Git discipline**: commit per completed task on this feature branch; halt and raise if a
commit cannot be made.

**Result: PASS — no violations. Complexity Tracking is empty (nothing to justify).**

## Project Structure

### Documentation (this feature)

```text
specs/001-fee-accounting/
├── plan.md              # This file (/speckit-plan output)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── rpc-contracts.md       # Money RPC signatures + Zod input/output schemas
│   ├── worker-endpoints.md    # Provider webhook + internal dispatch endpoint schemas
│   └── storage-contract.md    # Attachment bucket layout + tenant-scoped access rule
├── checklists/          # (pre-existing)
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
package.json                 # pnpm workspace root + Turborepo pipeline
pnpm-workspace.yaml
turbo.json

packages/
├── shared/                  # @erp/shared — domain types, Zod schemas, money-event types, SmsProvider interface
│   └── src/
│       ├── money/           # money-event type definitions + Zod schemas (single source of truth)
│       ├── sms/             # SmsProvider interface + segment-count util (Arabic Unicode)
│       └── schemas/         # shared Zod schemas (RPC i/o, form, webhook)
│
├── database/                # @erp/database — Supabase migrations, functions, RLS, seeds, generated types
│   ├── migrations/          # forward-only SQL migrations applied via Supabase MCP apply_migration
│   ├── functions/           # SQL source for money functions (apply_fee_payment, record_*, *_sms_credit, …)
│   ├── seeds/               # fixed stages/grades seed (Primary 6 / Middle 3 / Secondary 3, Arabic labels)
│   └── src/types/           # generate_typescript_types output consumed by other packages
│
├── ui/                      # @erp/ui — shared Radix/shadcn components (RTL-aware)
│   └── src/
│
├── web/                     # @erp/web — Next.js 14 App Router (Vercel)
│   ├── app/                 # routes: dashboard, students, accounts, fees, money events, reports, sms, admin
│   ├── components/
│   ├── lib/                 # supabase clients (ssr), TanStack Query, RPC callers, Zod boundary validation
│   ├── pdf/                 # @react-pdf/renderer statement & receipt templates (RTL)
│   └── tests/               # Playwright E2E + RTL/visual specs
│
└── api/                     # @erp/api — Express worker (Fly.io)
    └── src/
        ├── cron/            # daily reminder scheduler (per-school tz windows)
        ├── dispatch/        # SMS dispatch worker (build Arabic msg, check credit, send, consume_sms_credit)
        ├── providers/       # GenericHttpSmsProvider adapter (HTTP POST + webhook status normalizer)
        ├── routes/          # provider delivery webhook (inbound) + internal dispatch-trigger endpoint
        └── tests/           # Vitest integration tests
```

**Structure Decision**: Multi-package monorepo (Web application type) using the existing
`@erp/*` layout with `workspace:*` deps, pnpm workspaces, and Turborepo. Five packages —
`@erp/shared`, `@erp/database`, `@erp/ui`, `@erp/web`, `@erp/api` — separate the constitution's
service boundaries (Article VI): money logic in `@erp/database` (Postgres), UI/read in
`@erp/web`, the only long-running process in `@erp/api`, and the shared type/Zod/SmsProvider
source of truth in `@erp/shared`. No offline data layer is added (installable PWA only).

## Complexity Tracking

> No Constitution Check violations. No entries required.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| _(none)_ | — | — |

# Quickstart: School Fee Accounting

How to stand up the monorepo, configure environments, and run the constitution's verification
("The Gauntlet", Article X).

## Prerequisites

- Node.js 20, pnpm, Turborepo.
- A Supabase project (Postgres + Auth + Storage). **All DB work goes through Supabase MCP**
  (`apply_migration`, `generate_typescript_types`, `list_tables`) — never ad-hoc SQL clients
  (Article XII).
- Playwright (the **only** browser tool — Article XIII).

## Monorepo layout

```
packages/shared    @erp/shared    domain types, Zod schemas, money-event types, SmsProvider
packages/database  @erp/database  migrations, money functions, RLS, seeds, generated types
packages/ui        @erp/ui        shared RTL-aware components
packages/web       @erp/web       Next.js 14 (Vercel) — UI, reads, light CRUD, RPC calls
packages/api       @erp/api       Express worker (Fly.io) — cron, SMS dispatch, webhook
```

```bash
pnpm install
pnpm -w build          # turbo build across packages
```

## Environment variables (env-only; never hard-coded — Security & Secrets)

| Var | Used by | Purpose |
|---|---|---|
| `SUPABASE_URL` | web, api, database | project URL |
| `SUPABASE_ANON_KEY` | web | client (RLS-bound) |
| `SUPABASE_SERVICE_ROLE_KEY` | api | worker server-side ops |
| `SMS_PROVIDER` | api | selects the single adapter (e.g. `generic_http`) |
| `SMS_PROVIDER_BASE_URL` / `SMS_PROVIDER_API_KEY` | api | `GenericHttpSmsProvider` credentials |
| `SMS_WEBHOOK_SECRET` | api | verifies inbound delivery webhook |
| `DISPATCH_INTERNAL_TOKEN` | api | protects internal dispatch endpoints |
| `SCHOOL_TZ` | api, web | `Africa/Khartoum` (Article VIII) |

## Database setup (via Supabase MCP)

1. Apply migrations with `apply_migration`. **Money-touching migrations** (money tables,
   money functions, the receipt-number counter, RLS policies) are **flagged for owner review
   before apply** (Article XII human-in-the-loop gate).
2. Seed fixed stages/grades (Primary 6 / Middle 3 / Secondary 3, Arabic labels) and default
   reminder rules (3 before / on / 3 after).
3. `generate_typescript_types` → `@erp/database/src/types`, consumed by other packages
   (Article XI; no hand-written DB types).
4. Create the `money-attachments` Storage bucket + tenant RLS policy (see
   `contracts/storage-contract.md`).

## Run

```bash
pnpm --filter @erp/web dev      # Next.js
pnpm --filter @erp/api dev      # Express worker (cron + dispatch + webhook)
```

---

## The Gauntlet — verification (Article X)

Passing unit tests alone does **not** mean done. A money feature is verified by live
verification on a real Supabase instance, exercised through the UI via **Playwright** and
confirmed against actual rows via **Supabase MCP**.

### G1 — Reconciliation test (every money feature; SC-004)
After any sequence of money events, a balance computed **two independent ways** must match
exactly:
- **event-sum**: read raw events via Supabase MCP and sum.
- **derived figure**: the statement/dashboard value shown in the UI.
Assert equality to the SDG (zero drift). Run for: account balance, student balance,
installment running balance.

### G2 — Receipt-number concurrency test (SC-003)
Fire **parallel** `apply_fee_payment` inserts for the same school; assert the issued
`receipt_no` set is **gapless, unique, never reused** (no duplicate, no gap). Confirm a
rolled-back payment consumes **no** number.

### G3 — Money-critical E2E paths (Playwright; Article XIII)
1. Record a **partial payment** → receipt number issued → student balance and account
   balance update correctly → printable receipt renders **RTL Arabic** (SC-006).
2. Record **expense / transfer / refund / adjustment** → balances reconcile (G1).
3. **Reminder send** → credit decrements by **segment count** → `sms_message_log` entry with
   status (G: SMS) → insufficient credit skips + stops batch cleanly (FR-041).
4. **Subscription expiry** → read-only (grace) → view/export-only (locked); new money events
   and edits blocked 100% (SC-009).

### G4 — RTL/Arabic assertions
Playwright asserts right-to-left layout and correct Arabic rendering on **receipts and
statements** (customer-facing, printed) — numerals, dates, SDG currency (SC-013).

### G5 — Tenant isolation (SC-012)
Attempt cross-school reads/writes as a non-super-admin and as the super-admin against
financial tables; assert **zero** cross-tenant access (RLS default-deny holds).

### G6 — SMS credit integrity (SC-011)
Run a batch that **depletes** credit mid-run; assert credit never goes negative and is never
double-charged (atomic send+decrement holds), batch stops cleanly and reports sent-vs-skipped.

### Unit/integration (Vitest)
Postgres money functions (allocation order, overpayment block, reversing entries), segment
counting for Arabic Unicode, Zod boundary schemas, subscription-state derivation in
Africa/Khartoum.

## Definition of done (per Article IV/X)
No table is "done" without `school_id` (if tenant-scoped), an RLS policy, and explicit
`GRANT`s. No money feature is "done" without G1 reconciliation + (for payments) G2 concurrency
+ relevant G3 E2E, all green on a real Supabase instance.

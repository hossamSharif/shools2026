# Implementation Plan: [FEATURE]

**Branch**: `[###-feature-name]` | **Date**: [DATE] | **Spec**: [link]
**Input**: Feature specification from `/specs/[###-feature-name]/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

[Extract from feature spec: primary requirement + technical approach from research]

## Technical Context

<!--
  ACTION REQUIRED: Replace the content in this section with the technical details
  for the project. The structure here is presented in advisory capacity to guide
  the iteration process.
-->

**Language/Version**: [e.g., Python 3.11, Swift 5.9, Rust 1.75 or NEEDS CLARIFICATION]  
**Primary Dependencies**: [e.g., FastAPI, UIKit, LLVM or NEEDS CLARIFICATION]  
**Storage**: [if applicable, e.g., PostgreSQL, CoreData, files or N/A]  
**Testing**: [e.g., pytest, XCTest, cargo test or NEEDS CLARIFICATION]  
**Target Platform**: [e.g., Linux server, iOS 15+, WASM or NEEDS CLARIFICATION]
**Project Type**: [e.g., library/cli/web-service/mobile-app/compiler/desktop-app or NEEDS CLARIFICATION]  
**Performance Goals**: [domain-specific, e.g., 1000 req/s, 10k lines/sec, 60 fps or NEEDS CLARIFICATION]  
**Constraints**: [domain-specific, e.g., <200ms p95, <100MB memory, offline-capable or NEEDS CLARIFICATION]  
**Scale/Scope**: [domain-specific, e.g., 10k users, 1M LOC, 50 screens or NEEDS CLARIFICATION]

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Gates derive from `.specify/memory/constitution.md` (v1.2.0). Fill every row; mark an
article **N/A** only with a one-line reason. Any FAIL must appear in Complexity Tracking.

| Article | Gate (must be demonstrated by the plan) | How the plan satisfies it | Status |
|---|---|---|---|
| I — Financial Integrity | Money mutations are single-transaction DB functions; `NUMERIC(14,2)` SDG; gapless per-school receipt # assigned in-txn; idempotency keys on money/message ops | [...] | [PASS/FAIL/N/A] |
| II — Derived Balances | Balances computed from events; no app-written balance; any cache trigger-maintained and reconciling | [...] | [ ] |
| III — Append-Only Typed Ledger | Canonical event types; posted rows immutable; corrections by reversing entries; no financial deletes | [...] | [ ] |
| IV — Tenant Isolation in DB | Every tenant table: `school_id` + default-deny RLS + explicit GRANTs; super-admin walled off from financials | [...] | [ ] |
| V — Immutable Audit Trail | who/what/when recorded immutably for every money event & adjustment | [...] | [ ] |
| VI — Service Boundaries | Money math only in Postgres; Next.js = UI + light CRUD; worker owns scheduler/dispatch/webhook; SMS behind one provider interface | [...] | [ ] |
| VII — Credit & Messaging Integrity | Atomic send + segment-count decrement; skip on insufficient; logged; **every** outbound SMS (reminders, attendance, announcements, results, admissions) uses the same credit + dispatch path | [...] | [ ] |
| VIII — Africa/Khartoum Time | Store UTC; render and compute due dates/windows in school tz | [...] | [ ] |
| IX — Arabic-RTL & SDG | Arabic-only RTL everywhere incl. print and public pages; SDG only | [...] | [ ] |
| X — The Gauntlet | Live verification on real Supabase via Playwright + MCP row checks; reconciliation & receipt-# concurrency tests for money; forward-only migrations | [...] | [ ] |
| XI — Type Safety & Validation | Strict TS; Zod at every boundary (API, forms, webhooks, public intake); shared types as SoT | [...] | [ ] |
| XII — Supabase MCP for DB | All schema/migrations/types via MCP; owner review before money/RLS migrations | [...] | [ ] |
| XIII — Playwright for Browser | All E2E/RTL/visual via Playwright only | [...] | [ ] |
| XIV — Role & Relationship Access | Role × relationship access matrix for every new/changed table; teachers scoped to allocations, guardians to linked students, students to self; **no** school-wide policy for mere `authenticated`; finance tables readable only by `school_admin`/`accountant`/`viewer` (+ guardian statement via dedicated function); RLS tests for each denied case | [...] | [ ] |
| XV — Academic Record Integrity | Marks/attendance/results audited (who, when, old → new); marks locked after approval, changed only via authorized audited correction; explicit publish gate before guardian/student visibility; totals/averages/grades computed from stored marks | [...] | [ ] |
| XVI — Minors' Privacy | No student personal data on public pages; recorded guardian consent before student images are published; medical notes restricted to named roles via RLS; private tenant-scoped storage + short-lived signed URLs (TTL stated) | [...] | [ ] |
| XVII — Public Surface | Only public website + anonymous admission form are anonymous; anon reads only explicitly published content; anon creates only applications/contact messages via validated, rate-limited (limit stated), spam-protected intake; no `anon` access to tenant tables | [...] | [ ] |
| XVIII — Mobile-First Portal Budget | Guardian/student pages work at 360px; page-weight budget defined here; Playwright verification on throttled slow-3G profile | [...] | [ ] |

**Security & Secrets**: [list env-only secrets and where they are documented]
**Git discipline**: commit per completed task on the feature branch; halt and raise if a
commit cannot be made.

**Result**: [PASS / FAIL — list violations and justify each in Complexity Tracking]

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)
<!--
  ACTION REQUIRED: Replace the placeholder tree below with the concrete layout
  for this feature. Delete unused options and expand the chosen structure with
  real paths (e.g., apps/admin, packages/something). The delivered plan must
  not include Option labels.
-->

```text
# [REMOVE IF UNUSED] Option 1: Single project (DEFAULT)
src/
├── models/
├── services/
├── cli/
└── lib/

tests/
├── contract/
├── integration/
└── unit/

# [REMOVE IF UNUSED] Option 2: Web application (when "frontend" + "backend" detected)
backend/
├── src/
│   ├── models/
│   ├── services/
│   └── api/
└── tests/

frontend/
├── src/
│   ├── components/
│   ├── pages/
│   └── services/
└── tests/

# [REMOVE IF UNUSED] Option 3: Mobile + API (when "iOS/Android" detected)
api/
└── [same as backend above]

ios/ or android/
└── [platform-specific structure: feature modules, UI flows, platform tests]
```

**Structure Decision**: [Document the selected structure and reference the real
directories captured above]

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |

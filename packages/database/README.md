# @erp/database

Supabase migrations, money functions, RLS policies, seeds, and MCP-generated types.

## Migration workflow (Article XII — Supabase MCP)

All schema changes ship as **forward-only** SQL migrations applied via the Supabase MCP
`apply_migration` tool — never ad-hoc SQL clients. The `.sql` files in `migrations/` and
`functions/` are the reviewable source of record; each is applied by name to the live project.

1. Author the migration `.sql` under `migrations/NNNN_name.sql` (or a function under
   `functions/`).
2. **Owner-review gate**: if the migration touches any of —
   - money tables (`money_event`, `installment`, `payment_allocation`, `receipt_counter`,
     `sms_credit_*`, `discount`, `audit_entry`, `account`, `subscription`, …),
   - money functions (`apply_fee_payment`, `record_*`, `apply_discount`, `*_sms_credit`,
     `reverse_event`, write-gating),
   - the receipt-number counter, or
   - RLS policies / GRANTs
   — it is **flagged for owner review before `apply_migration`**. Do not apply without approval.
3. Apply via `apply_migration({ project_id, name, query })`.
4. After schema changes, regenerate types with `generate_typescript_types` into
   `src/types/database.ts` (never hand-edit).

## Layout

```
migrations/   forward-only SQL, applied via Supabase MCP apply_migration
  _templates/ reusable policy templates (not applied directly)
functions/    SQL source for money functions + helpers
seeds/        fixed reference data (stages/grades, default reminder rules)
src/types/    generate_typescript_types output (single source of truth — Article XI)
src/functions/ Vitest integration tests for the money functions (Article X)
```

## Tenant-isolation checklist (Article IV) — every new tenant table

- Carries a `school_id` column.
- Enables RLS with a **default-deny** posture (no policy ⇒ no access).
- Adds an explicit same-school `USING` / `WITH CHECK` policy keyed to `current_school_id()`.
- Grants the minimal privileges to the `authenticated` role.
- Financial tables additionally **exclude super-admin** reads.

See `migrations/_templates/tenant_rls.sql` for the reusable pattern.

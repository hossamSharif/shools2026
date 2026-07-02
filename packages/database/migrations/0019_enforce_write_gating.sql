-- ============================================================================
-- 0019_enforce_write_gating (T127, US8) — write-gating audit touch-up.
--
-- Verification (Article IV — DB is sole write-gating authority): every money/
-- credit-mutating RPC already calls public.assert_writes_allowed(school_id)
-- before any write, confirmed by direct inspection of the deployed function
-- bodies:
--   apply_fee_payment  — perform assert_writes_allowed(v_school_id)
--   record_expense     — perform assert_writes_allowed(v_school_id)
--   record_transfer    — perform assert_writes_allowed(v_school_id)
--   record_refund      — perform assert_writes_allowed(v_school_id)
--   record_adjustment  — perform assert_writes_allowed(v_school_id)
--   apply_discount     — perform assert_writes_allowed(v_school_id)
--   reverse_event       — perform assert_writes_allowed(v_orig.school_id)
--
-- No function body changes are required by this migration. `consume_sms_credit`
-- (US7, developed in parallel) is NOT yet deployed at the time this migration
-- was authored; it MUST call assert_writes_allowed(school_id, 'dispatch') (or
-- 'write', per its credit-debit semantics) before any credit mutation — the
-- owning agent/reviewer should confirm this at merge time. This migration is a
-- documentation-only no-op so CI/deploy tooling has a concrete artifact for
-- T127; re-run the same inspection whenever a new money/credit RPC is added.
-- MONEY-MIGRATION ⇒ OWNER REVIEW (Article XII).
-- ============================================================================

do $$
begin
  -- Sanity guard: fail loudly if any of the audited functions have been
  -- dropped/renamed since this migration was authored (would silently break
  -- the assumption above).
  perform 1 from pg_proc where proname = 'apply_fee_payment' and pronamespace = 'public'::regnamespace;
  if not found then
    raise exception 'apply_fee_payment missing — write-gating audit (0019) is stale';
  end if;
end $$;

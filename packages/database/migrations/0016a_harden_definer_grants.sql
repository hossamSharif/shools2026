-- ============================================================================
-- 0016a_harden_definer_grants
-- Defense-in-depth for the US2–US4 SECURITY DEFINER functions (Supabase advisor
-- 0028/0029): revoke the default PUBLIC/anon EXECUTE so they are only reachable
-- by authenticated users. Each function additionally self-enforces tenant/role.
-- The internal trigger function is not part of the public API — revoke fully.
-- MONEY-MIGRATION ⇒ OWNER REVIEW (Article XII).
-- ============================================================================

revoke execute on function public.generate_installments(uuid) from public, anon;
revoke execute on function public.trg_generate_installments() from public, anon, authenticated;
revoke execute on function public.record_opening_balance(uuid, numeric, date) from public, anon;
revoke execute on function public.account_balance(uuid) from public, anon;
revoke execute on function public.installment_running_balance(uuid) from public, anon;
revoke execute on function public.student_balance(uuid) from public, anon;
revoke execute on function public.apply_fee_payment(uuid, uuid, numeric, timestamptz, uuid, jsonb, text) from public, anon;
revoke execute on function public.record_expense(uuid, numeric, text, timestamptz, uuid, text, text, text) from public, anon;
revoke execute on function public.record_transfer(uuid, uuid, numeric, timestamptz, uuid, text) from public, anon;
revoke execute on function public.record_refund(uuid, uuid, numeric, timestamptz, uuid, text, text) from public, anon;
revoke execute on function public.record_adjustment(uuid, numeric, text, timestamptz, uuid) from public, anon;
revoke execute on function public.apply_discount(uuid, public.discount_kind, numeric, uuid, uuid, text) from public, anon;
revoke execute on function public.reverse_event(uuid, text, uuid) from public, anon;

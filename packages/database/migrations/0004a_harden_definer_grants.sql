-- ============================================================================
-- 0004a_harden_definer_grants
-- Defense-in-depth for the SECURITY DEFINER helpers/functions (Supabase advisor
-- 0028/0029): revoke the default PUBLIC/anon EXECUTE so they are only reachable
-- by authenticated users. Each function additionally self-enforces role.
-- MONEY-ADJACENT ⇒ OWNER REVIEW (Article XII).
-- ============================================================================

revoke execute on function public.current_school_id() from public, anon;
revoke execute on function public.current_role() from public, anon;
revoke execute on function public.current_is_super_admin() from public, anon;
revoke execute on function public.subscription_state(uuid) from public, anon;
revoke execute on function public.assert_writes_allowed(uuid, text) from public, anon;
revoke execute on function public.topup_sms_credit(uuid, int, uuid) from public, anon;

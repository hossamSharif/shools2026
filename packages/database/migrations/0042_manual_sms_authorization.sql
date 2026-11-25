-- ============================================================================
-- 0042_manual_sms_authorization (spec 002, rpc-contracts §D, tasks T037).
-- New SECURITY DEFINER gate reachable by authenticated ⇒ OWNER REVIEW (XII).
--
-- authorize_manual_sms(p_student_id): the worker calls it AS THE REQUESTING
-- USER (user-scoped client from the forwarded JWT) before the unchanged
-- dispatch + consume_sms_credit path. It refuses unless the caller holds
-- sms.send_manual (FORBIDDEN_PERMISSION) and may read the student, within
-- stage scope (FORBIDDEN_STUDENT). Nothing is sent or charged on refusal
-- (Article VII). For Phase 1 roles the result is unchanged: school_admin and
-- accountant hold sms.send_manual; viewer never could send.
--
-- Also extends the reviewed allow-list of the policy audit (0041).
-- ============================================================================

create or replace function public.authorize_manual_sms(p_student_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.assert_perm('sms.send_manual');
  if not public.can_read_student(p_student_id) then
    raise exception 'FORBIDDEN_STUDENT' using
      errcode = 'P0001',
      hint = 'الطالب لا ينتمي لمدرستك.';
  end if;
end;
$$;

comment on function public.authorize_manual_sms(uuid) is
  'Manual SMS gate (rpc-contracts §D): sms.send_manual + student in scope, checked as the requesting user.';

revoke execute on function public.authorize_manual_sms(uuid) from public, anon;
grant execute on function public.authorize_manual_sms(uuid) to authenticated, service_role;

-- ── Reviewed allow-list: + authorize_manual_sms ─────────────────────────────
create or replace function public.reviewed_definer_functions()
returns text[]
language sql
immutable
set search_path = public
as $$
  select array[
    -- Phase 1 tenant resolution and gating helpers
    'current_school_id', 'current_role', 'current_is_super_admin',
    'subscription_state', 'assert_writes_allowed', 'assert_target_school',
    -- Phase 1 profile
    'update_own_display_name',
    -- Feature 002 decision helpers (0037)
    'my_access', 'my_role_set', 'has_perm', 'perm_scope', 'assert_perm',
    'current_year_id', 'student_stage_id', 'can_read_student', 'can_write_student',
    'teacher_section_ids', 'portal_student_ids',
    -- Money RPCs (finance.write, 0039)
    'apply_fee_payment', 'record_expense', 'record_transfer', 'record_refund',
    'record_adjustment', 'apply_discount', 'reverse_event', 'record_opening_balance',
    -- Derived reads (0039)
    'account_balance', 'installment_running_balance', 'student_balance', 'sms_credit_balance',
    'student_statement', 'student_payments', 'receivables_aging', 'dashboard_kpis',
    'student_directory', 'student_financial_summary', 'student_installments',
    -- Super-admin only (checks current_is_super_admin itself)
    'topup_sms_credit',
    -- Manual SMS gate (0042)
    'authorize_manual_sms'
  ]::text[];
$$;

comment on function public.reviewed_definer_functions() is
  'Allow-list of SECURITY DEFINER functions reviewed for authenticated callers (rpc-contracts.md). Extend by create or replace.';

revoke execute on function public.reviewed_definer_functions() from public, anon, authenticated;
grant execute on function public.reviewed_definer_functions() to service_role;

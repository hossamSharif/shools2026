-- ============================================================================
-- 0046_optional_permission_functions (spec 002, rpc-contracts §A/§B,
-- tasks T071). New definer functions ⇒ OWNER REVIEW (XII).
--
-- * optional_permission_matrix(): the permissions screen's data. One row per
--   catalogue switch (optional_permission) with its default and this school's
--   current value. users.read.
-- * set_optional_permission(): users.manage. Only (role, key) pairs in the
--   catalogue can be stored (NOT_GRANTABLE otherwise; the composite FK of
--   0035 makes any other pair unstorable anyway). Switching ON is a grant and
--   is write-gated; switching OFF is a revocation and always allowed (FR-023).
--   One access_audit_entry 'optional_permission_changed' per real change;
--   setting a switch to the value it already has changes and logs nothing.
--   has_perm() reads the table on every statement, so a change applies to
--   every open session on its next request (SC-006).
-- ============================================================================

-- ── optional_permission_matrix ──────────────────────────────────────────────
create or replace function public.optional_permission_matrix()
returns table (
  role public.user_role, permission_key text, label_ar text,
  default_enabled boolean, enabled boolean, changed_by uuid, changed_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_school uuid;
begin
  perform public.assert_perm('users.read');
  v_school := public.current_school_id();
  return query
  select op.role, op.permission_key, op.label_ar, op.default_enabled,
         coalesce(srp.enabled, op.default_enabled), srp.changed_by, srp.changed_at
    from public.optional_permission op
    left join public.school_role_permission srp
      on srp.school_id = v_school and srp.role = op.role and srp.permission_key = op.permission_key
   order by op.role, op.permission_key;
end;
$$;

comment on function public.optional_permission_matrix() is
  'Optional switches of the catalogue with this school''s value (users.read).';

-- ── set_optional_permission ─────────────────────────────────────────────────
create or replace function public.set_optional_permission(
  p_role public.user_role, p_key text, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_school  uuid;
  v_default boolean;
  v_old     boolean;
begin
  perform public.assert_perm('users.manage');
  v_school := public.current_school_id();

  if p_enabled is null then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', hint = 'قيمة غير صالحة.';
  end if;
  select op.default_enabled into v_default
    from public.optional_permission op
   where op.role = p_role and op.permission_key = p_key;
  if not found then
    raise exception 'NOT_GRANTABLE' using errcode = 'P0001',
      hint = 'لا يمكن منح هذه الصلاحية لهذا الدور.';
  end if;

  perform public.um_lock_school(v_school);
  -- Re-checked after the lock: a concurrent change may have removed the caller's right.
  perform public.assert_perm('users.manage');
  if p_enabled then
    perform public.assert_writes_allowed(v_school);
  end if;

  select coalesce(
           (select srp.enabled from public.school_role_permission srp
             where srp.school_id = v_school and srp.role = p_role and srp.permission_key = p_key),
           v_default)
    into v_old;
  if v_old = p_enabled then
    return;
  end if;

  insert into public.school_role_permission (school_id, role, permission_key, enabled, changed_by, changed_at)
  values (v_school, p_role, p_key, p_enabled, auth.uid(), now())
  on conflict (school_id, role, permission_key) do update
    set enabled = excluded.enabled,
        changed_by = excluded.changed_by,
        changed_at = excluded.changed_at;

  perform public.write_access_audit(
    v_school, auth.uid(), null, null, 'optional_permission_changed',
    jsonb_build_object('role', p_role, 'key', p_key, 'enabled', v_old),
    jsonb_build_object('role', p_role, 'key', p_key, 'enabled', p_enabled));
end;
$$;

comment on function public.set_optional_permission(public.user_role, text, boolean) is
  'Switch one catalogue permission for a role in the caller''s school (users.manage; ON is write-gated).';

-- ── Grants ──────────────────────────────────────────────────────────────────
revoke execute on function public.optional_permission_matrix() from public, anon;
revoke execute on function public.set_optional_permission(public.user_role, text, boolean) from public, anon;
grant execute on function public.optional_permission_matrix() to authenticated, service_role;
grant execute on function public.set_optional_permission(public.user_role, text, boolean) to authenticated;

-- ── Reviewed allow-list (0041, last extended in 0045) ───────────────────────
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
    'topup_sms_credit', 'superadmin_set_school_admin',
    -- Manual SMS gate (0042)
    'authorize_manual_sms',
    -- User management (0044): users.read / users.manage checked inside
    'list_school_users', 'list_invitations', 'create_invitation', 'issue_invitation_token',
    'revoke_invitation', 'set_user_roles', 'deactivate_user', 'reactivate_user',
    -- New roles (0045)
    'teacher_roster', 'register_student', 'teacher_can_see_student',
    -- Optional permissions (0046)
    'optional_permission_matrix', 'set_optional_permission'
  ]::text[];
$$;

revoke execute on function public.reviewed_definer_functions() from public, anon, authenticated;
grant execute on function public.reviewed_definer_functions() to service_role;

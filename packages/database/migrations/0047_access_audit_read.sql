-- ============================================================================
-- 0047_access_audit_read (spec 002, rpc-contracts §A, tasks T076 + the T033
-- advisor follow-up). New definer function + RLS changes ⇒ OWNER REVIEW (XII).
--
-- * list_access_audit(): the audit screen and its CSV export (FR-031–FR-033).
--   users.read; the caller's school only; newest first, keyset-paged on id
--   (p_before_id); at most 500 rows a page. p_user_id matches the actor OR
--   the target. Display names are joined here, so the web needs no extra
--   reads of `user`.
-- * get_advisors (T033), issues added by feature 002 only:
--   - multiple permissive SELECT policies on role_assignment,
--     role_assignment_stage and portal_link: each pair (own row + users.read)
--     becomes ONE policy with the same meaning (own row OR same school with
--     users.read). Nothing becomes more or less visible;
--   - covering indexes for the feature 002 foreign keys the advisor listed.
--   Phase 1 findings (pg_trgm in public, the school/subscription/topup/user
--   policy pairs, the Phase 1 FKs) are left as they are.
-- ============================================================================

-- ── list_access_audit ───────────────────────────────────────────────────────
create or replace function public.list_access_audit(
  p_user_id   uuid default null,
  p_action    public.access_audit_action default null,
  p_from      timestamptz default null,
  p_to        timestamptz default null,
  p_limit     int default 100,
  p_before_id bigint default null)
returns table (
  id bigint, occurred_at timestamptz,
  actor_id uuid, actor_name text,
  target_user_id uuid, target_name text, target_email text,
  action public.access_audit_action, before jsonb, after jsonb)
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
  select a.id, a.occurred_at,
         a.actor_id, ua.display_name,
         a.target_user_id, ut.display_name, a.target_email::text,
         a.action, a.before, a.after
    from public.access_audit_entry a
    left join public.user ua on ua.id = a.actor_id
    left join public.user ut on ut.id = a.target_user_id
   where a.school_id = v_school
     and (p_user_id is null or a.actor_id = p_user_id or a.target_user_id = p_user_id)
     and (p_action is null or a.action = p_action)
     and (p_from is null or a.occurred_at >= p_from)
     and (p_to is null or a.occurred_at < p_to)
     and (p_before_id is null or a.id < p_before_id)
   order by a.id desc
   limit least(greatest(coalesce(p_limit, 100), 1), 500);
end;
$$;

comment on function public.list_access_audit(uuid, public.access_audit_action, timestamptz, timestamptz, int, bigint) is
  'Access audit of the caller''s school, newest first, keyset-paged (users.read). p_to is exclusive.';

revoke execute on function public.list_access_audit(uuid, public.access_audit_action, timestamptz, timestamptz, int, bigint)
  from public, anon;
grant execute on function public.list_access_audit(uuid, public.access_audit_action, timestamptz, timestamptz, int, bigint)
  to authenticated, service_role;

-- Keyset paging within a school.
create index if not exists access_audit_school_id_desc_idx
  on public.access_audit_entry (school_id, id desc);

-- ── T033: one SELECT policy per table (same meaning as the two it replaces) ──
drop policy if exists "role_assignment_own_select" on public.role_assignment;
drop policy if exists "role_assignment_users_read" on public.role_assignment;
create policy "role_assignment_select" on public.role_assignment for select to authenticated
  using (
    user_id = (select auth.uid())
    or (school_id = (select public.current_school_id()) and (select public.has_perm('users.read')))
  );

drop policy if exists "role_assignment_stage_own_select" on public.role_assignment_stage;
drop policy if exists "role_assignment_stage_users_read" on public.role_assignment_stage;
create policy "role_assignment_stage_select" on public.role_assignment_stage for select to authenticated
  using (
    exists (select 1 from public.role_assignment ra
             where ra.id = role_assignment_stage.assignment_id and ra.user_id = (select auth.uid()))
    or (school_id = (select public.current_school_id()) and (select public.has_perm('users.read')))
  );

drop policy if exists "portal_link_own_select" on public.portal_link;
drop policy if exists "portal_link_users_read" on public.portal_link;
create policy "portal_link_select" on public.portal_link for select to authenticated
  using (
    user_id = (select auth.uid())
    or (school_id = (select public.current_school_id()) and (select public.has_perm('users.read')))
  );

-- ── T033: covering indexes for the feature 002 foreign keys ─────────────────
create index if not exists access_audit_actor_idx on public.access_audit_entry (actor_id);
create index if not exists access_audit_target_idx on public.access_audit_entry (target_user_id);
create index if not exists invitation_revoked_by_idx on public.invitation (revoked_by);
create index if not exists role_assignment_assigned_by_idx on public.role_assignment (assigned_by);
create index if not exists role_assignment_stage_stage_idx on public.role_assignment_stage (stage_id);
create index if not exists role_permission_default_key_idx on public.role_permission_default (permission_key);
create index if not exists optional_permission_key_idx on public.optional_permission (permission_key);
create index if not exists school_role_permission_catalogue_idx
  on public.school_role_permission (role, permission_key);
create index if not exists school_role_permission_changed_by_idx
  on public.school_role_permission (changed_by);
create index if not exists portal_link_school_idx on public.portal_link (school_id);
create index if not exists user_deactivated_by_idx on public.user (deactivated_by);

-- ── Reviewed allow-list (0041, last extended in 0046) ───────────────────────
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
    'optional_permission_matrix', 'set_optional_permission',
    -- Access audit (0047)
    'list_access_audit'
  ]::text[];
$$;

revoke execute on function public.reviewed_definer_functions() from public, anon, authenticated;
grant execute on function public.reviewed_definer_functions() to service_role;

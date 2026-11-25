-- ============================================================================
-- 0041_policy_audit_function (spec 002, research R11, rpc-contracts §F, T032).
-- Reads catalogs only, but defines the gate for every RLS change ⇒ OWNER REVIEW.
--
-- audit_access_policies() returns one row per violation; the policy-audit test
-- (src/access/policy-audit.test.ts) requires zero rows (FR-035, SC-002).
--   rls_disabled / rls_not_forced / no_policy
--       a public table with a school_id column without forced RLS or policies;
--   signed_in_only_policy
--       a policy for authenticated/public (public schema or storage.objects)
--       whose expressions reference no decision helper and no auth.uid();
--   role_column_authz
--       a policy, or a public function body, that calls current_role() other
--       than through current_is_super_admin();
--   unreviewed_definer
--       a SECURITY DEFINER function in public that authenticated can execute
--       and that is not in reviewed_definer_functions();
--   definer_public_execute
--       a SECURITY DEFINER function in public that anon (or PUBLIC) can execute;
--   catalogue_never_grantable
--       a never-grantable (role, key) pair stored in the catalogue or switches.
--
-- The reviewed allow-list lives in its own small function so later
-- migrations (0042–0047) extend it with `create or replace` of that function
-- only. It mirrors contracts/rpc-contracts.md.
--
-- Also fixes the one finding the audit has today: update_own_display_name
-- (0026) was still executable by anon. It only acts on auth.uid(), so for anon
-- it was a no-op, but no definer function may be anon-executable (XVII).
-- ============================================================================

revoke execute on function public.update_own_display_name(text) from public, anon;
grant execute on function public.update_own_display_name(text) to authenticated;

-- ── Reviewed definer functions executable by authenticated ──────────────────
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
    'topup_sms_credit'
  ]::text[];
$$;

comment on function public.reviewed_definer_functions() is
  'Allow-list of SECURITY DEFINER functions reviewed for authenticated callers (rpc-contracts.md). Extend by create or replace.';

revoke execute on function public.reviewed_definer_functions() from public, anon, authenticated;
grant execute on function public.reviewed_definer_functions() to service_role;

-- ── The audit ───────────────────────────────────────────────────────────────
create or replace function public.audit_access_policies()
returns table (object text, kind text, detail text)
language sql
stable
security definer
set search_path = public
as $$
  with tenant_tables as (
    select c.oid, c.relname, c.relrowsecurity, c.relforcerowsecurity
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind in ('r', 'p')
       and exists (select 1 from pg_attribute a
                    where a.attrelid = c.oid and a.attname = 'school_id' and not a.attisdropped)
  ),
  reference_tables(name) as (
    values ('stage'), ('grade'), ('permission'), ('role_permission_default'), ('optional_permission')
  ),
  pol as (
    select p.schemaname, p.tablename, p.policyname, p.roles,
           coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '') as expr
      from pg_policies p
     where (p.schemaname = 'public' or (p.schemaname = 'storage' and p.tablename = 'objects'))
       and (p.roles && array['authenticated', 'public']::name[])
  ),
  definers as (
    select p.oid, p.proname, p.prosrc,
           has_function_privilege('authenticated', p.oid, 'execute') as auth_exec,
           has_function_privilege('anon', p.oid, 'execute') as anon_exec
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef
  )
  -- 1. tenant tables
  select t.relname::text, 'rls_disabled', 'ENABLE ROW LEVEL SECURITY is off'
    from tenant_tables t where not t.relrowsecurity
  union all
  select t.relname::text, 'rls_not_forced', 'FORCE ROW LEVEL SECURITY is off'
    from tenant_tables t where t.relrowsecurity and not t.relforcerowsecurity
  union all
  select t.relname::text, 'no_policy', 'RLS on but no policy'
    from tenant_tables t
   where not exists (select 1 from pg_policy pp where pp.polrelid = t.oid)
  union all
  -- 2. signed-in-only policies
  select p.schemaname || '.' || p.tablename || ':' || p.policyname, 'signed_in_only_policy', p.expr
    from pol p
   where not (p.schemaname = 'public' and p.tablename in (select name from reference_tables))
     and p.expr !~ '(has_perm|perm_scope|can_read_student|can_write_student|portal_student_ids|teacher_section_ids|current_is_super_admin)\('
     and p.expr !~ 'auth\.uid\(\)'
  union all
  -- 3. authorization on user.role
  select p.schemaname || '.' || p.tablename || ':' || p.policyname, 'role_column_authz', p.expr
    from pol p
   where p.expr ~ 'current_role"?\(\)'
  union all
  select 'function ' || d.proname, 'role_column_authz', 'body calls current_role()'
    from definers d
   where d.proname not in ('current_role', 'current_is_super_admin', 'audit_access_policies')
     and d.prosrc ~ 'current_role\(\)'
  union all
  -- 4. definer exposure
  select 'function ' || d.proname, 'unreviewed_definer', 'authenticated can execute; not in reviewed_definer_functions()'
    from definers d
   where d.auth_exec and not (d.proname = any(public.reviewed_definer_functions()))
  union all
  select 'function ' || d.proname, 'definer_public_execute', 'anon/PUBLIC can execute a SECURITY DEFINER function'
    from definers d
   where d.anon_exec
  union all
  -- 5. never-grantable catalogue rows
  select 'role_permission_default ' || r.role || ':' || r.permission_key, 'catalogue_never_grantable', ''
    from public.role_permission_default r
   where public.is_never_grantable(r.role, r.permission_key)
  union all
  select 'optional_permission ' || o.role || ':' || o.permission_key, 'catalogue_never_grantable', ''
    from public.optional_permission o
   where public.is_never_grantable(o.role, o.permission_key)
  union all
  select 'school_role_permission ' || s.school_id || ' ' || s.role || ':' || s.permission_key,
         'catalogue_never_grantable', ''
    from public.school_role_permission s
   where s.enabled and public.is_never_grantable(s.role, s.permission_key);
$$;

comment on function public.audit_access_policies() is
  'FR-035: access-policy violations (zero rows required). service_role only.';

revoke execute on function public.audit_access_policies() from public, anon, authenticated;
grant execute on function public.audit_access_policies() to service_role;

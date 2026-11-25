-- ============================================================================
-- 0037_access_helpers (spec 002, data-model §9, research R1/R7/R8/R13).
-- Decision helpers every policy and exposed function uses from 0038 on.
-- TOUCHES RLS ⇒ OWNER REVIEW before apply (Article XII).
--
-- * current_school_id() becomes status- and assignment-aware: deactivation and
--   losing the last role close all access on the next request (FR-028).
-- * has_perm / perm_scope read assignments and switches fresh on every
--   statement. In policies always call them as (select public.fn(...)) so
--   they are evaluated once per statement as an init-plan (R13).
-- * A service_role JWT (or a session without a JWT) is allow-all and
--   school-wide, so worker calls behave exactly as today.
--
-- Phase 1 behaviour is unchanged: 0034 gave every school user one school-wide
-- assignment equal to user.role, and no Phase 1 policy is rewritten here.
-- Source mirror: packages/database/functions/access_helpers.sql.
-- ============================================================================

-- ── current_school_id() (redefined) ─────────────────────────────────────────
create or replace function public.current_school_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select u.school_id
    from public.user u
   where u.id = auth.uid()
     and u.status = 'active'
     and exists (select 1 from public.role_assignment ra where ra.user_id = u.id);
$$;

comment on function public.current_school_id() is
  'Caller''s school only while status = active and at least one role is assigned (FR-028). NULL for super_admin.';

-- ── Effective grants (internal) ─────────────────────────────────────────────
-- Union over the caller's assignments of the role defaults and the optional
-- switches that are on (school setting, else catalogue default).
create or replace function public.my_effective_grants()
returns table (assignment_id uuid, role public.user_role, permission_key text)
language sql
stable
security definer
set search_path = public
as $$
  with a as (
    select ra.id, ra.role, ra.school_id
      from public.role_assignment ra
      join public.user u on u.id = ra.user_id
     where ra.user_id = auth.uid()
       and u.status = 'active'
       and u.school_id = ra.school_id
  )
  select a.id, a.role, d.permission_key
    from a
    join public.role_permission_default d on d.role = a.role
  union
  select a.id, a.role, o.permission_key
    from a
    join public.optional_permission o on o.role = a.role
    left join public.school_role_permission s
           on s.school_id = a.school_id
          and s.role = o.role
          and s.permission_key = o.permission_key
   where coalesce(s.enabled, o.default_enabled);
$$;

comment on function public.my_effective_grants() is
  'Internal: (assignment, role, key) rows the active caller holds. Not exposed.';

-- ── my_role_set() ───────────────────────────────────────────────────────────
create or replace function public.my_role_set()
returns public.user_role[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(ra.role order by ra.role), '{}'::public.user_role[])
    from public.role_assignment ra
    join public.user u on u.id = ra.user_id
   where ra.user_id = auth.uid()
     and u.status = 'active';
$$;

-- ── has_perm(key) ───────────────────────────────────────────────────────────
create or replace function public.has_perm(p_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_service_caller()
      or exists (select 1 from public.my_effective_grants() g where g.permission_key = p_key);
$$;

comment on function public.has_perm(text) is
  'True when the key is in the caller''s effective set (any scope). Allow-all for service_role.';

-- ── perm_scope(key) ─────────────────────────────────────────────────────────
-- NULL = school-wide; '{}' = no grant; otherwise the union of stage ids of the
-- granting assignments. Any school-wide granting assignment, or a key that is
-- not stage_scopable, gives NULL (R7).
create or replace function public.perm_scope(p_key text)
returns uuid[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_assignments uuid[];
  v_scopable    boolean;
  v_stages      uuid[];
begin
  if public.is_service_caller() then
    return null;
  end if;

  select array_agg(distinct g.assignment_id) into v_assignments
    from public.my_effective_grants() g
   where g.permission_key = p_key;
  if v_assignments is null then
    return '{}'::uuid[];
  end if;

  select p.stage_scopable into v_scopable from public.permission p where p.key = p_key;
  if not coalesce(v_scopable, false) then
    return null;
  end if;

  if exists (
    select 1 from unnest(v_assignments) as x(id)
     where not exists (select 1 from public.role_assignment_stage s where s.assignment_id = x.id)
  ) then
    return null;
  end if;

  select array_agg(distinct s.stage_id) into v_stages
    from public.role_assignment_stage s
   where s.assignment_id = any(v_assignments);
  return coalesce(v_stages, '{}'::uuid[]);
end;
$$;

comment on function public.perm_scope(text) is
  'Stage scope of a key for the caller: NULL school-wide, ''{}'' none, else stage ids (FR-018a).';

-- ── current_year_id() ───────────────────────────────────────────────────────
create or replace function public.current_year_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select ay.id
    from public.academic_year ay
   where ay.school_id = public.current_school_id()
     and ay.is_current
   order by ay.created_at desc
   limit 1;
$$;

-- ── student_stage_id(student) ───────────────────────────────────────────────
-- Stage of the student's enrollment in their school's current academic year.
-- NULL when not enrolled this year or not active (withdrawn/graduated), so such
-- students match only school-wide scopes (R7 edge case).
create or replace function public.student_stage_id(p_student_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select g.stage_id
    from public.enrollment e
    join public.student st on st.id = e.student_id and st.status = 'active'
    join public.academic_year ay
      on ay.id = e.academic_year_id and ay.school_id = e.school_id and ay.is_current
    join public.grade g on g.id = e.grade_id
   where e.student_id = p_student_id
   order by ay.created_at desc
   limit 1;
$$;

-- ── teacher_section_ids() ───────────────────────────────────────────────────
-- Relationship seam for teachers. Feature 02 (teacher allocations) replaces
-- this body; until then a teacher is allocated to no section.
create or replace function public.teacher_section_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select '{}'::uuid[];
$$;

comment on function public.teacher_section_ids() is
  'Sections allocated to the calling teacher. Stub returning {} until feature 02 replaces the body.';

-- ── portal_student_ids() ────────────────────────────────────────────────────
create or replace function public.portal_student_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(pl.student_id), '{}'::uuid[])
    from public.portal_link pl
   where pl.user_id = auth.uid()
     and pl.school_id = public.current_school_id()
     and ((pl.kind = 'guardian' and public.has_perm('portal.linked'))
       or (pl.kind = 'self' and public.has_perm('portal.self')));
$$;

comment on function public.portal_student_ids() is
  'Students linked to the calling guardian/student through portal_link (FR-014).';

-- ── can_read_student / can_write_student ────────────────────────────────────
create or replace function public.can_read_student(p_student_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_school uuid := public.current_school_id();
  v_scope  uuid[];
begin
  if v_school is null
     or not exists (select 1 from public.student s
                     where s.id = p_student_id and s.school_id = v_school) then
    return false;
  end if;

  if public.has_perm('students.read') then
    v_scope := public.perm_scope('students.read');
    if v_scope is null or public.student_stage_id(p_student_id) = any(v_scope) then
      return true;
    end if;
  end if;

  return p_student_id = any(public.portal_student_ids());
end;
$$;

comment on function public.can_read_student(uuid) is
  'students.read within stage scope, or a portal link to the student.';

create or replace function public.can_write_student(p_student_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_school uuid := public.current_school_id();
  v_scope  uuid[];
begin
  if v_school is null
     or not public.has_perm('students.write')
     or not exists (select 1 from public.student s
                     where s.id = p_student_id and s.school_id = v_school) then
    return false;
  end if;
  v_scope := public.perm_scope('students.write');
  return v_scope is null or coalesce(public.student_stage_id(p_student_id) = any(v_scope), false);
end;
$$;

comment on function public.can_write_student(uuid) is
  'students.write within stage scope (stage-scoped writers only reach currently enrolled students).';

-- ── assert_perm(key) ────────────────────────────────────────────────────────
create or replace function public.assert_perm(p_key text)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_perm(p_key) then
    raise exception 'FORBIDDEN_PERMISSION' using
      errcode = 'P0001',
      hint = 'لا تملك صلاحية تنفيذ هذا الإجراء.';
  end if;
end;
$$;

-- ── my_access() ─────────────────────────────────────────────────────────────
-- The caller's resolved context (contracts/rpc-contracts.md §A, Zod MyAccess).
-- The only source the screens use to show or hide things.
create or replace function public.my_access()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_user     public.user%rowtype;
  v_roles    text[];
  v_perms    text[];
  v_scope    jsonb;
  v_is_super boolean;
begin
  if v_uid is null then
    raise exception 'FORBIDDEN_PERMISSION' using
      errcode = 'P0001',
      hint = 'لا تملك صلاحية تنفيذ هذا الإجراء.';
  end if;

  select * into v_user from public.user u where u.id = v_uid;
  if not found then
    -- Auth identity without a profile yet (pending invitation).
    return jsonb_build_object(
      'user_id', v_uid, 'school_id', null, 'status', 'invited',
      'roles', '[]'::jsonb, 'is_staff', false, 'is_super_admin', false,
      'permissions', '[]'::jsonb, 'stage_scope', '{}'::jsonb);
  end if;

  v_is_super := v_user.role = 'super_admin';

  if v_is_super then
    v_roles := array['super_admin'];
  else
    select coalesce(array_agg(ra.role::text order by case ra.role
                       when 'school_admin'    then 1
                       when 'principal'       then 2
                       when 'accountant'      then 3
                       when 'student_affairs' then 4
                       when 'teacher'         then 5
                       when 'viewer'          then 6
                       when 'guardian'        then 7
                       when 'student'         then 8
                       else 9 end), '{}')
      into v_roles
      from public.role_assignment ra
     where ra.user_id = v_uid;
  end if;

  select coalesce(array_agg(distinct g.permission_key order by g.permission_key), '{}')
    into v_perms
    from public.my_effective_grants() g;

  select coalesce(jsonb_object_agg(k, case when sc is null then 'null'::jsonb else to_jsonb(sc) end), '{}'::jsonb)
    into v_scope
    from (select k, public.perm_scope(k) as sc from unnest(v_perms) as k) x;

  return jsonb_build_object(
    'user_id', v_uid,
    'school_id', public.current_school_id(),
    'status', v_user.status,
    'roles', to_jsonb(v_roles),
    'is_staff', v_roles && array['school_admin', 'principal', 'student_affairs',
                                 'teacher', 'accountant', 'viewer'],
    'is_super_admin', v_is_super,
    'permissions', to_jsonb(v_perms),
    'stage_scope', v_scope);
end;
$$;

comment on function public.my_access() is
  'Caller context for screens: roles, status, effective permissions and stage scope (rpc-contracts §A).';

-- ── Grants ──────────────────────────────────────────────────────────────────
revoke execute on function public.my_effective_grants() from public, anon, authenticated;
grant execute on function public.my_effective_grants() to service_role;

revoke execute on function public.current_school_id() from public, anon;
revoke execute on function public.my_role_set() from public, anon;
revoke execute on function public.has_perm(text) from public, anon;
revoke execute on function public.perm_scope(text) from public, anon;
revoke execute on function public.current_year_id() from public, anon;
revoke execute on function public.student_stage_id(uuid) from public, anon;
revoke execute on function public.teacher_section_ids() from public, anon;
revoke execute on function public.portal_student_ids() from public, anon;
revoke execute on function public.can_read_student(uuid) from public, anon;
revoke execute on function public.can_write_student(uuid) from public, anon;
revoke execute on function public.assert_perm(text) from public, anon;
revoke execute on function public.my_access() from public, anon;

grant execute on function public.current_school_id() to authenticated, service_role;
grant execute on function public.my_role_set() to authenticated, service_role;
grant execute on function public.has_perm(text) to authenticated, service_role;
grant execute on function public.perm_scope(text) to authenticated, service_role;
grant execute on function public.current_year_id() to authenticated, service_role;
grant execute on function public.student_stage_id(uuid) to authenticated, service_role;
grant execute on function public.teacher_section_ids() to authenticated, service_role;
grant execute on function public.portal_student_ids() to authenticated, service_role;
grant execute on function public.can_read_student(uuid) to authenticated, service_role;
grant execute on function public.can_write_student(uuid) to authenticated, service_role;
grant execute on function public.assert_perm(text) to authenticated, service_role;
grant execute on function public.my_access() to authenticated, service_role;

-- ============================================================================
-- T017: users.read policies that depend on has_perm (data-model §3–§6).
-- ============================================================================

create policy "role_assignment_users_read"
  on public.role_assignment for select to authenticated
  using (
    school_id = (select public.current_school_id())
    and (select public.has_perm('users.read'))
  );

create policy "role_assignment_stage_users_read"
  on public.role_assignment_stage for select to authenticated
  using (
    school_id = (select public.current_school_id())
    and (select public.has_perm('users.read'))
  );

create policy "portal_link_users_read"
  on public.portal_link for select to authenticated
  using (
    school_id = (select public.current_school_id())
    and (select public.has_perm('users.read'))
  );

create policy "school_role_permission_users_read"
  on public.school_role_permission for select to authenticated
  using (
    school_id = (select public.current_school_id())
    and (select public.has_perm('users.read'))
  );

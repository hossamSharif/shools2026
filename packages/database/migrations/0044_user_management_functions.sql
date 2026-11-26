-- ============================================================================
-- 0044_user_management_functions (spec 002, rpc-contracts §A–§B, tasks T051).
-- Definer functions that change roles and status ⇒ OWNER REVIEW (Article XII).
--
-- The ONLY way to change who holds which role (FR-025–FR-030). Common rules
-- of every mutating function, in this order:
--   1. assert_perm('users.manage');
--   2. the target is in the caller's school (else NOT_FOUND, no existence
--      leak) and is not the caller (SELF_CHANGE_FORBIDDEN);
--   3. pg_advisory_xact_lock on the school, then the permission is checked
--      again (a concurrent call may just have demoted the caller);
--   4. grants (invite, add role, widen stages, reactivate) call
--      assert_writes_allowed; revocations never do (FR-023). A change that
--      both grants and revokes is refused as a whole in grace/locked.
-- Exactly one access_audit_entry per logical change, in the same transaction.
-- Changes to user.role / user.status set app.access_sync only around their
-- own UPDATE and restore it afterwards (see 0037a).
-- ============================================================================

-- ── Internal helpers ────────────────────────────────────────────────────────

create or replace function public.um_role_rank(p_role public.user_role)
returns int
language sql
immutable
set search_path = public
as $$
  select case p_role
           when 'school_admin'    then 1
           when 'principal'       then 2
           when 'accountant'      then 3
           when 'student_affairs' then 4
           when 'teacher'         then 5
           when 'viewer'          then 6
           when 'guardian'        then 7
           when 'student'         then 8
           else 9
         end;
$$;

-- Stage ids of one role inside a stage_scope object; '{}' = school-wide.
create or replace function public.um_stage_ids(p_stage_scope jsonb, p_role text)
returns uuid[]
language sql
immutable
set search_path = public
as $$
  select coalesce(
           (select array_agg(distinct x::uuid order by x::uuid)
              from jsonb_array_elements_text(coalesce(p_stage_scope -> p_role, '[]'::jsonb)) as x),
           '{}'::uuid[]);
$$;

-- Validates a requested staff role set and stage scope.
create or replace function public.um_validate(p_roles public.user_role[], p_stage_scope jsonb)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  k text;
begin
  if p_roles is null or cardinality(p_roles) = 0 then
    raise exception 'ROLES_REQUIRED' using errcode = 'P0001',
      hint = 'يجب إسناد دور واحد على الأقل؛ لإيقاف الحساب استخدم الإيقاف.';
  end if;
  if 'super_admin' = any(p_roles) then
    raise exception 'NOT_GRANTABLE' using errcode = 'P0001',
      hint = 'هذا الدور غير قابل للإسناد.';
  end if;
  if p_roles && array['guardian', 'student']::public.user_role[] then
    raise exception 'PORTAL_STAFF_MIX' using errcode = 'P0001',
      hint = 'أدوار البوابة تُدار من بوابة أولياء الأمور والطلاب.';
  end if;
  if p_stage_scope is null or jsonb_typeof(p_stage_scope) <> 'object' then
    raise exception 'STAGE_SCOPE_NOT_ALLOWED' using errcode = 'P0001',
      hint = 'نطاق المراحل غير صالح.';
  end if;
  for k in select jsonb_object_keys(p_stage_scope) loop
    if k not in ('principal', 'student_affairs') or not (k::public.user_role = any(p_roles)) then
      raise exception 'STAGE_SCOPE_NOT_ALLOWED' using errcode = 'P0001',
        hint = 'تحديد المرحلة متاح فقط لدوري المدير الأكاديمي وشؤون الطلاب.';
    end if;
    if jsonb_typeof(p_stage_scope -> k) <> 'array'
       or exists (select 1 from unnest(public.um_stage_ids(p_stage_scope, k)) s(id)
                   where not exists (select 1 from public.stage st where st.id = s.id)) then
      raise exception 'STAGE_SCOPE_NOT_ALLOWED' using errcode = 'P0001',
        hint = 'إحدى المراحل المحددة غير موجودة.';
    end if;
  end loop;
end;
$$;

-- Resolves a management target in the caller's school; refuses self and
-- portal-only users (managed by feature 08).
create or replace function public.um_target(p_user_id uuid)
returns public.user
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v public.user%rowtype;
begin
  select * into v from public.user u
   where u.id = p_user_id and u.school_id = public.current_school_id();
  if not found
     or (exists (select 1 from public.role_assignment ra where ra.user_id = v.id)
         and not exists (select 1 from public.role_assignment ra
                          where ra.user_id = v.id and ra.role not in ('guardian', 'student'))) then
    raise exception 'NOT_FOUND' using errcode = 'P0001',
      hint = 'المستخدم غير موجود في مدرستك.';
  end if;
  if v.id = auth.uid() then
    raise exception 'SELF_CHANGE_FORBIDDEN' using errcode = 'P0001',
      hint = 'لا يمكنك تعديل أدوارك أو حالتك بنفسك.';
  end if;
  return v;
end;
$$;

create or replace function public.um_lock_school(p_school_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  select pg_advisory_xact_lock(hashtextextended(p_school_id::text, 0));
$$;

-- Other ACTIVE users of the school holding school_admin.
create or replace function public.um_other_active_admins(p_school_id uuid, p_except uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(distinct u.id)::int
    from public.user u
    join public.role_assignment ra on ra.user_id = u.id and ra.role = 'school_admin'
   where u.school_id = p_school_id and u.status = 'active' and u.id <> p_except;
$$;

create or replace function public.um_user_roles(p_user_id uuid)
returns public.user_role[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(ra.role order by public.um_role_rank(ra.role)), '{}'::public.user_role[])
    from public.role_assignment ra where ra.user_id = p_user_id;
$$;

create or replace function public.um_user_stage_scope(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_object_agg(x.role, x.stages), '{}'::jsonb)
    from (select ra.role::text as role, jsonb_agg(s.stage_id order by s.stage_id) as stages
            from public.role_assignment ra
            join public.role_assignment_stage s on s.assignment_id = ra.id
           where ra.user_id = p_user_id
           group by ra.role) x;
$$;

-- Sets user.status with the role-model bypass flag scoped to this UPDATE.
create or replace function public.um_set_status(p_user_id uuid, p_status public.user_status, p_by uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev text := coalesce(current_setting('app.access_sync', true), '');
begin
  perform set_config('app.access_sync', 'on', true);
  update public.user
     set status = p_status,
         deactivated_at = case when p_status = 'deactivated' then now() end,
         deactivated_by = case when p_status = 'deactivated' then p_by end
   where id = p_user_id;
  perform set_config('app.access_sync', v_prev, true);
end;
$$;

-- ── A. Reads ────────────────────────────────────────────────────────────────

create or replace function public.list_school_users()
returns table (
  user_id uuid, display_name text, email text, status public.user_status,
  roles public.user_role[], stage_scope jsonb, is_portal boolean,
  created_at timestamptz, deactivated_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.assert_perm('users.read');
  return query
  select u.id, u.display_name, au.email::text, u.status,
         public.um_user_roles(u.id),
         public.um_user_stage_scope(u.id),
         coalesce(public.um_user_roles(u.id) <@ array['guardian', 'student']::public.user_role[]
                  and cardinality(public.um_user_roles(u.id)) > 0, false),
         u.created_at, u.deactivated_at
    from public.user u
    left join auth.users au on au.id = u.id
   where u.school_id = public.current_school_id()
   order by u.status, u.display_name;
end;
$$;

create or replace function public.list_invitations()
returns table (
  id uuid, email text, roles public.user_role[], stage_scope jsonb,
  state public.invitation_state, invited_by uuid, invited_by_name text,
  expires_at timestamptz, created_at timestamptz,
  accepted_at timestamptz, revoked_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.assert_perm('users.read');
  return query
  select i.id, i.email::text, i.roles, i.stage_scope, i.state, i.invited_by, u.display_name,
         i.expires_at, i.created_at, i.accepted_at, i.revoked_at
    from public.invitation i
    left join public.user u on u.id = i.invited_by
   where i.school_id = public.current_school_id()
   order by i.created_at desc;
end;
$$;

-- ── B. Invitations ──────────────────────────────────────────────────────────

create or replace function public.create_invitation(
  p_email text, p_roles public.user_role[], p_stage_scope jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_school uuid;
  v_email  text := lower(trim(p_email));
  v_id     uuid;
begin
  perform public.assert_perm('users.manage');
  v_school := public.current_school_id();
  perform public.um_lock_school(v_school);
  perform public.assert_perm('users.manage');
  perform public.assert_writes_allowed(v_school);
  perform public.um_validate(p_roles, coalesce(p_stage_scope, '{}'::jsonb));

  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'EMAIL_IN_USE' using errcode = 'P0001', hint = 'البريد الإلكتروني غير صالح.';
  end if;
  if exists (select 1 from auth.users au join public.user u on u.id = au.id
              where lower(au.email) = v_email) then
    raise exception 'EMAIL_IN_USE' using errcode = 'P0001',
      hint = 'هذا البريد مرتبط بحساب موجود.';
  end if;
  if exists (select 1 from public.invitation i
              where i.school_id = v_school and i.email = v_email::extensions.citext and i.state = 'pending') then
    raise exception 'EMAIL_IN_USE' using errcode = 'P0001',
      hint = 'توجد دعوة معلّقة لهذا البريد بالفعل.';
  end if;

  insert into public.invitation (school_id, email, roles, stage_scope, invited_by)
  values (v_school, v_email::extensions.citext, p_roles, coalesce(p_stage_scope, '{}'::jsonb), auth.uid())
  returning id into v_id;

  perform public.write_access_audit(
    v_school, auth.uid(), null, v_email, 'invitation_sent', '{}'::jsonb,
    jsonb_build_object('email', v_email, 'roles', to_jsonb(p_roles),
                       'stage_scope', coalesce(p_stage_scope, '{}'::jsonb)));
  return v_id;
end;
$$;

-- Returns the raw token ONCE (base64url of 32 random bytes) and stores only
-- its SHA-256. Calling it again rotates the token (resend). Called by the
-- worker with the admin's own JWT.
create or replace function public.issue_invitation_token(p_invitation_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv   public.invitation%rowtype;
  v_token text;
begin
  perform public.assert_perm('users.manage');
  select * into v_inv from public.invitation
   where id = p_invitation_id and school_id = public.current_school_id()
   for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001', hint = 'الدعوة غير موجودة.';
  end if;
  if v_inv.state <> 'pending' or now() >= v_inv.expires_at then
    raise exception 'INVITATION_INVALID' using errcode = 'P0001',
      hint = 'الدعوة لم تعد صالحة.';
  end if;
  perform public.assert_writes_allowed(v_inv.school_id);

  v_token := rtrim(translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), '=');
  update public.invitation
     set token_hash = extensions.digest(v_token, 'sha256')
   where id = v_inv.id;
  return v_token;
end;
$$;

create or replace function public.revoke_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv public.invitation%rowtype;
begin
  perform public.assert_perm('users.manage');
  select * into v_inv from public.invitation
   where id = p_invitation_id and school_id = public.current_school_id();
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001', hint = 'الدعوة غير موجودة.';
  end if;
  perform public.um_lock_school(v_inv.school_id);
  perform public.assert_perm('users.manage');
  select * into v_inv from public.invitation where id = p_invitation_id for update;
  if v_inv.state <> 'pending' then
    raise exception 'INVITATION_INVALID' using errcode = 'P0001',
      hint = 'الدعوة لم تعد معلّقة.';
  end if;

  update public.invitation
     set state = 'revoked', revoked_at = now(), revoked_by = auth.uid()
   where id = v_inv.id;
  perform public.write_access_audit(
    v_inv.school_id, auth.uid(), null, v_inv.email::text, 'invitation_revoked',
    jsonb_build_object('state', 'pending'), jsonb_build_object('state', 'revoked'));
end;
$$;

-- service_role only (the worker). Every token failure is INVITATION_INVALID.
create or replace function public.accept_invitation(
  p_token_hash bytea, p_display_name text, p_auth_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv     public.invitation%rowtype;
  v_primary public.user_role;
  v_role    public.user_role;
  v_aid     uuid;
  v_stage   uuid;
begin
  select * into v_inv from public.invitation where token_hash = p_token_hash for update;
  if not found
     or v_inv.state <> 'pending'
     or now() >= v_inv.expires_at
     or (v_inv.auth_user_id is not null and v_inv.auth_user_id <> p_auth_user_id)
     or not exists (select 1 from auth.users au
                     where au.id = p_auth_user_id and lower(au.email) = lower(v_inv.email::text))
     or exists (select 1 from public.user u where u.id = p_auth_user_id) then
    raise exception 'INVITATION_INVALID' using errcode = 'P0001',
      hint = 'رابط الدعوة غير صالح أو منتهي الصلاحية. اطلب دعوة جديدة من إدارة المدرسة.';
  end if;
  if p_display_name is null or length(trim(p_display_name)) < 2 then
    raise exception 'INVITATION_INVALID' using errcode = 'P0001', hint = 'الاسم مطلوب.';
  end if;

  perform public.um_lock_school(v_inv.school_id);
  select r into v_primary from unnest(v_inv.roles) r order by public.um_role_rank(r) limit 1;

  -- The AFTER INSERT trigger on user creates the primary assignment.
  insert into public.user (id, role, school_id, display_name, status)
  values (p_auth_user_id, v_primary, v_inv.school_id, trim(p_display_name), 'active');

  foreach v_role in array v_inv.roles loop
    insert into public.role_assignment (user_id, school_id, role, assigned_by)
    values (p_auth_user_id, v_inv.school_id, v_role, v_inv.invited_by)
    on conflict (user_id, role) do update set assigned_by = excluded.assigned_by;
    if v_role in ('principal', 'student_affairs') then
      select id into v_aid from public.role_assignment where user_id = p_auth_user_id and role = v_role;
      foreach v_stage in array public.um_stage_ids(v_inv.stage_scope, v_role::text) loop
        insert into public.role_assignment_stage (assignment_id, stage_id, school_id)
        values (v_aid, v_stage, v_inv.school_id);
      end loop;
    end if;
  end loop;

  update public.invitation
     set state = 'accepted', accepted_at = now(), auth_user_id = p_auth_user_id
   where id = v_inv.id;
  perform public.write_access_audit(
    v_inv.school_id, p_auth_user_id, p_auth_user_id, v_inv.email::text, 'invitation_accepted',
    '{}'::jsonb, jsonb_build_object('roles', to_jsonb(v_inv.roles), 'stage_scope', v_inv.stage_scope));

  return jsonb_build_object('user_id', p_auth_user_id, 'school_id', v_inv.school_id,
                            'roles', to_jsonb(v_inv.roles));
end;
$$;

-- service_role only (daily cron).
create or replace function public.expire_invitations()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv record;
  v_n   int := 0;
begin
  for v_inv in
    update public.invitation set state = 'expired'
     where state = 'pending' and expires_at <= now()
    returning id, school_id, email
  loop
    perform public.write_access_audit(
      v_inv.school_id, null, null, v_inv.email::text, 'invitation_expired',
      jsonb_build_object('state', 'pending'), jsonb_build_object('state', 'expired'));
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

-- ── B. Roles and status ─────────────────────────────────────────────────────

create or replace function public.set_user_roles(
  p_user_id uuid, p_roles public.user_role[], p_stage_scope jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user      public.user%rowtype;
  v_old       public.user_role[];
  v_new       public.user_role[];
  v_added     public.user_role[];
  v_removed   public.user_role[];
  v_scope     jsonb := coalesce(p_stage_scope, '{}'::jsonb);
  v_role      public.user_role;
  v_old_st    uuid[];
  v_new_st    uuid[];
  v_grant     boolean := false;
  v_revoke    boolean := false;
  v_aid       uuid;
  v_stage     uuid;
  v_changes   jsonb := '[]'::jsonb;
  c           jsonb;
begin
  perform public.assert_perm('users.manage');
  v_user := public.um_target(p_user_id);
  perform public.um_lock_school(v_user.school_id);
  perform public.assert_perm('users.manage');
  perform public.um_validate(p_roles, v_scope);

  v_old := public.um_user_roles(p_user_id);
  select coalesce(array_agg(distinct r order by r), '{}') into v_new from unnest(p_roles) r;
  select coalesce(array_agg(r), '{}') into v_added from unnest(v_new) r where not (r = any(v_old));
  select coalesce(array_agg(r), '{}') into v_removed from unnest(v_old) r where not (r = any(v_new));
  v_grant := cardinality(v_added) > 0;
  v_revoke := cardinality(v_removed) > 0;

  -- Stage-scope changes on roles that are kept.
  foreach v_role in array array['principal', 'student_affairs']::public.user_role[] loop
    continue when not (v_role = any(v_new)) or not (v_role = any(v_old));
    select coalesce(array_agg(s.stage_id order by s.stage_id), '{}') into v_old_st
      from public.role_assignment ra join public.role_assignment_stage s on s.assignment_id = ra.id
     where ra.user_id = p_user_id and ra.role = v_role;
    v_new_st := public.um_stage_ids(v_scope, v_role::text);
    continue when v_old_st = v_new_st;
    -- widened: scoped → school-wide, or a stage added; narrowed: the reverse
    if (cardinality(v_old_st) > 0 and cardinality(v_new_st) = 0)
       or exists (select 1 from unnest(v_new_st) x where cardinality(v_old_st) > 0 and not (x = any(v_old_st))) then
      v_grant := true;
    end if;
    if (cardinality(v_old_st) = 0 and cardinality(v_new_st) > 0)
       or exists (select 1 from unnest(v_old_st) x where cardinality(v_new_st) > 0 and not (x = any(v_new_st))) then
      v_revoke := true;
    end if;
    v_changes := v_changes || jsonb_build_object('role', v_role, 'before', to_jsonb(v_old_st), 'after', to_jsonb(v_new_st));
  end loop;

  if v_grant then
    perform public.assert_writes_allowed(v_user.school_id);  -- whole call refused in grace/locked
  end if;
  if 'school_admin' = any(v_removed) and v_user.status = 'active'
     and public.um_other_active_admins(v_user.school_id, p_user_id) = 0 then
    raise exception 'LAST_ADMIN_PROTECTED' using errcode = 'P0001',
      hint = 'لا يمكن إزالة دور آخر مدير نشط للمدرسة.';
  end if;

  -- Apply: additions first so the user always holds at least one role.
  foreach v_role in array v_added loop
    insert into public.role_assignment (user_id, school_id, role, assigned_by)
    values (p_user_id, v_user.school_id, v_role, auth.uid());
    perform public.write_access_audit(v_user.school_id, auth.uid(), p_user_id, null, 'role_added',
      jsonb_build_object('roles', to_jsonb(v_old)),
      jsonb_build_object('roles', to_jsonb(v_new), 'role', v_role,
                         'stages', to_jsonb(public.um_stage_ids(v_scope, v_role::text))));
    if v_role in ('principal', 'student_affairs') then
      select id into v_aid from public.role_assignment where user_id = p_user_id and role = v_role;
      foreach v_stage in array public.um_stage_ids(v_scope, v_role::text) loop
        insert into public.role_assignment_stage (assignment_id, stage_id, school_id)
        values (v_aid, v_stage, v_user.school_id);
      end loop;
    end if;
  end loop;

  foreach v_role in array v_removed loop
    delete from public.role_assignment where user_id = p_user_id and role = v_role;
    perform public.write_access_audit(v_user.school_id, auth.uid(), p_user_id, null, 'role_removed',
      jsonb_build_object('roles', to_jsonb(v_old), 'role', v_role),
      jsonb_build_object('roles', to_jsonb(v_new)));
  end loop;

  for c in select * from jsonb_array_elements(v_changes) loop
    select id into v_aid from public.role_assignment
     where user_id = p_user_id and role = (c ->> 'role')::public.user_role;
    delete from public.role_assignment_stage where assignment_id = v_aid;
    insert into public.role_assignment_stage (assignment_id, stage_id, school_id)
    select v_aid, x::uuid, v_user.school_id from jsonb_array_elements_text(c -> 'after') x;
    perform public.write_access_audit(v_user.school_id, auth.uid(), p_user_id, null, 'stage_scope_changed',
      jsonb_build_object('role', c ->> 'role', 'stages', c -> 'before'),
      jsonb_build_object('role', c ->> 'role', 'stages', c -> 'after'));
  end loop;
end;
$$;

create or replace function public.deactivate_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.user%rowtype;
begin
  perform public.assert_perm('users.manage');
  v_user := public.um_target(p_user_id);
  perform public.um_lock_school(v_user.school_id);
  perform public.assert_perm('users.manage');
  select * into v_user from public.user where id = p_user_id;
  if v_user.status = 'deactivated' then
    return;
  end if;
  if exists (select 1 from public.role_assignment ra where ra.user_id = p_user_id and ra.role = 'school_admin')
     and public.um_other_active_admins(v_user.school_id, p_user_id) = 0 then
    raise exception 'LAST_ADMIN_PROTECTED' using errcode = 'P0001',
      hint = 'لا يمكن إيقاف آخر مدير نشط للمدرسة.';
  end if;

  perform public.um_set_status(p_user_id, 'deactivated', auth.uid());
  perform public.write_access_audit(v_user.school_id, auth.uid(), p_user_id, null, 'user_deactivated',
    jsonb_build_object('status', v_user.status), jsonb_build_object('status', 'deactivated'));
end;
$$;

create or replace function public.reactivate_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.user%rowtype;
begin
  perform public.assert_perm('users.manage');
  v_user := public.um_target(p_user_id);
  perform public.um_lock_school(v_user.school_id);
  perform public.assert_perm('users.manage');
  perform public.assert_writes_allowed(v_user.school_id);
  select * into v_user from public.user where id = p_user_id;
  if v_user.status = 'active' then
    return;
  end if;

  perform public.um_set_status(p_user_id, 'active', null);
  perform public.write_access_audit(v_user.school_id, auth.uid(), p_user_id, null, 'user_reactivated',
    jsonb_build_object('status', v_user.status),
    jsonb_build_object('status', 'active', 'roles', to_jsonb(public.um_user_roles(p_user_id))));
end;
$$;

-- Super-admin only: make an existing staff user of any school its admin (and
-- reactivate them). Not write-gated, so a locked school can still get an
-- admin. Audited in the target school; the super-admin still cannot read it.
create or replace function public.superadmin_set_school_admin(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.user%rowtype;
  v_old  public.user_role[];
begin
  if not public.current_is_super_admin() then
    raise exception 'FORBIDDEN_PERMISSION' using errcode = 'P0001',
      hint = 'لا تملك صلاحية تنفيذ هذا الإجراء.';
  end if;
  select * into v_user from public.user where id = p_user_id and school_id is not null;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001', hint = 'المستخدم غير موجود.';
  end if;
  perform public.um_lock_school(v_user.school_id);
  v_old := public.um_user_roles(p_user_id);

  if not ('school_admin' = any(v_old)) then
    insert into public.role_assignment (user_id, school_id, role, assigned_by)
    values (p_user_id, v_user.school_id, 'school_admin', auth.uid());
    perform public.write_access_audit(v_user.school_id, auth.uid(), p_user_id, null, 'role_added',
      jsonb_build_object('roles', to_jsonb(v_old)),
      jsonb_build_object('roles', to_jsonb(public.um_user_roles(p_user_id)), 'role', 'school_admin'));
  end if;
  if v_user.status <> 'active' then
    perform public.um_set_status(p_user_id, 'active', null);
    perform public.write_access_audit(v_user.school_id, auth.uid(), p_user_id, null, 'user_reactivated',
      jsonb_build_object('status', v_user.status), jsonb_build_object('status', 'active'));
  end if;
end;
$$;

-- ── Grants ──────────────────────────────────────────────────────────────────
revoke execute on function public.um_role_rank(public.user_role) from public, anon, authenticated;
revoke execute on function public.um_stage_ids(jsonb, text) from public, anon, authenticated;
revoke execute on function public.um_validate(public.user_role[], jsonb) from public, anon, authenticated;
revoke execute on function public.um_target(uuid) from public, anon, authenticated;
revoke execute on function public.um_lock_school(uuid) from public, anon, authenticated;
revoke execute on function public.um_other_active_admins(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.um_user_roles(uuid) from public, anon, authenticated;
revoke execute on function public.um_user_stage_scope(uuid) from public, anon, authenticated;
revoke execute on function public.um_set_status(uuid, public.user_status, uuid) from public, anon, authenticated;

revoke execute on function public.list_school_users() from public, anon;
revoke execute on function public.list_invitations() from public, anon;
revoke execute on function public.create_invitation(text, public.user_role[], jsonb) from public, anon;
revoke execute on function public.issue_invitation_token(uuid) from public, anon;
revoke execute on function public.revoke_invitation(uuid) from public, anon;
revoke execute on function public.set_user_roles(uuid, public.user_role[], jsonb) from public, anon;
revoke execute on function public.deactivate_user(uuid) from public, anon;
revoke execute on function public.reactivate_user(uuid) from public, anon;
revoke execute on function public.superadmin_set_school_admin(uuid) from public, anon;
grant execute on function public.list_school_users() to authenticated, service_role;
grant execute on function public.list_invitations() to authenticated, service_role;
grant execute on function public.create_invitation(text, public.user_role[], jsonb) to authenticated;
grant execute on function public.issue_invitation_token(uuid) to authenticated;
grant execute on function public.revoke_invitation(uuid) to authenticated;
grant execute on function public.set_user_roles(uuid, public.user_role[], jsonb) to authenticated;
grant execute on function public.deactivate_user(uuid) to authenticated;
grant execute on function public.reactivate_user(uuid) to authenticated;
grant execute on function public.superadmin_set_school_admin(uuid) to authenticated;

revoke execute on function public.accept_invitation(bytea, text, uuid) from public, anon, authenticated;
revoke execute on function public.expire_invitations() from public, anon, authenticated;
grant execute on function public.accept_invitation(bytea, text, uuid) to service_role;
grant execute on function public.expire_invitations() to service_role;

-- ── Reviewed allow-list (0041): + the user-management RPCs ──────────────────
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
    'revoke_invitation', 'set_user_roles', 'deactivate_user', 'reactivate_user'
  ]::text[];
$$;

revoke execute on function public.reviewed_definer_functions() from public, anon, authenticated;
grant execute on function public.reviewed_definer_functions() to service_role;

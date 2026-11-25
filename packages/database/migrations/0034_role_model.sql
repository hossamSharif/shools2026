-- ============================================================================
-- 0034_role_model (spec 002, data-model §1–§4, research R2).
-- Multi-role users: role_assignment (+ optional stage scope), user.status, and
-- the triggers that keep the legacy user.role column as a denormalised
-- "primary role". TOUCHES RLS ⇒ OWNER REVIEW before apply (Article XII).
--
-- Phase 1 behaviour is unchanged after this migration: every existing school
-- user is backfilled with exactly one school-wide assignment equal to
-- user.role, and no tenant policy reads the new tables yet.
-- ============================================================================

-- ── 1. Enums ────────────────────────────────────────────────────────────────
create type public.user_status as enum ('invited', 'active', 'deactivated');
create type public.invitation_state as enum ('pending', 'accepted', 'revoked', 'expired');
create type public.portal_link_kind as enum ('guardian', 'self');
create type public.access_audit_action as enum (
  'invitation_sent', 'invitation_accepted', 'invitation_revoked', 'invitation_expired',
  'role_added', 'role_removed', 'stage_scope_changed',
  'user_deactivated', 'user_reactivated',
  'optional_permission_changed'
);

-- ── 2. public.user extensions ───────────────────────────────────────────────
alter table public.user
  add column status         public.user_status not null default 'active',
  add column deactivated_at timestamptz,
  add column deactivated_by uuid references public.user (id) on delete set null;

alter table public.user
  add constraint user_invited_has_school
    check (status <> 'invited' or school_id is not null),
  add constraint user_super_admin_active
    check (role <> 'super_admin' or status = 'active');

-- ── 3. role_assignment ──────────────────────────────────────────────────────
create table public.role_assignment (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.school (id) on delete cascade,
  user_id     uuid not null references public.user (id) on delete cascade,
  role        public.user_role not null,
  assigned_by uuid references public.user (id) on delete set null,
  assigned_at timestamptz not null default now(),
  constraint role_assignment_user_role_unique unique (user_id, role),
  constraint role_assignment_not_super_admin check (role <> 'super_admin')
);

create index role_assignment_user_idx on public.role_assignment (user_id);
create index role_assignment_school_role_idx on public.role_assignment (school_id, role);

comment on table public.role_assignment is
  'Roles held by a school user (multi-role = union of rights, FR-004/009). Authority for permissions; user.role is only a denormalised primary role.';

-- ── 4. role_assignment_stage ────────────────────────────────────────────────
-- No rows for an assignment = school-wide (FR-018a).
create table public.role_assignment_stage (
  assignment_id uuid not null references public.role_assignment (id) on delete cascade,
  stage_id      uuid not null references public.stage (id),
  school_id     uuid not null references public.school (id) on delete cascade,
  primary key (assignment_id, stage_id)
);

create index role_assignment_stage_school_idx on public.role_assignment_stage (school_id);

-- ── 5. Helper: is the caller trusted (service_role JWT or no JWT)? ──────────
-- Same rule as public.assert_target_school (0032a): the worker (service_role)
-- and direct database sessions without a JWT are trusted.
create or replace function public.is_service_caller()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
           when nullif(current_setting('request.jwt.claims', true), '') is null
                and nullif(current_setting('request.jwt.claim.role', true), '') is null
             then true   -- no JWT at all: direct database session
           else coalesce(
                  nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
                  nullif(current_setting('request.jwt.claim.role', true), '')
                ) is not distinct from 'service_role'
         end;
$$;

comment on function public.is_service_caller() is
  'True for a service_role JWT or a session without a JWT (worker, migrations).';

revoke execute on function public.is_service_caller() from public, anon, authenticated;
grant execute on function public.is_service_caller() to service_role;

-- ── 6. Triggers ─────────────────────────────────────────────────────────────

-- 6a. role_assignment_guard (BEFORE INSERT OR UPDATE): the assignment's school
--     must equal the user's school, and portal + staff roles never mix.
create or replace function public.trg_role_assignment_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_school uuid;
  v_is_portal   boolean := new.role in ('guardian', 'student');
begin
  select u.school_id into v_user_school from public.user u where u.id = new.user_id;
  if v_user_school is null or v_user_school is distinct from new.school_id then
    raise exception 'FORBIDDEN_SCHOOL' using
      errcode = 'P0001',
      hint = 'لا يمكن إسناد دور في مدرسة أخرى غير مدرسة المستخدم.';
  end if;

  if exists (
    select 1 from public.role_assignment ra
     where ra.user_id = new.user_id
       and ra.id is distinct from new.id
       and (ra.role in ('guardian', 'student')) <> v_is_portal
  ) then
    raise exception 'PORTAL_STAFF_MIX' using
      errcode = 'P0001',
      hint = 'لا يمكن الجمع بين أدوار البوابة وأدوار الموظفين في حساب واحد.';
  end if;
  return new;
end;
$$;

create trigger role_assignment_guard
  before insert or update on public.role_assignment
  for each row execute function public.trg_role_assignment_guard();

-- 6b. role_assignment_stage check: only principal / student_affairs carry stages,
--     and the stage row's school equals the assignment's school.
create or replace function public.trg_role_assignment_stage_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role   public.user_role;
  v_school uuid;
begin
  select ra.role, ra.school_id into v_role, v_school
    from public.role_assignment ra where ra.id = new.assignment_id;
  if v_role is null or v_role not in ('principal', 'student_affairs') then
    raise exception 'STAGE_SCOPE_NOT_ALLOWED' using
      errcode = 'P0001',
      hint = 'تحديد المرحلة متاح فقط لدوري المدير الأكاديمي وشؤون الطلاب.';
  end if;
  if new.school_id is distinct from v_school then
    raise exception 'FORBIDDEN_SCHOOL' using
      errcode = 'P0001',
      hint = 'لا تملك صلاحية الوصول لبيانات هذه المدرسة.';
  end if;
  return new;
end;
$$;

create trigger role_assignment_stage_guard
  before insert or update on public.role_assignment_stage
  for each row execute function public.trg_role_assignment_stage_guard();

-- 6c. role_assignment_sync_primary (AFTER INSERT/DELETE): recompute user.role by
--     precedence school_admin > principal > accountant > student_affairs >
--     teacher > viewer > guardian > student. A user with no assignment left
--     keeps the previous value (the column is NOT NULL); access is closed by
--     current_school_id() requiring at least one assignment (0037).
create or replace function public.trg_role_assignment_sync_primary()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := coalesce(new.user_id, old.user_id);
  v_primary public.user_role;
begin
  select ra.role into v_primary
    from public.role_assignment ra
   where ra.user_id = v_user_id
   order by case ra.role
              when 'school_admin'    then 1
              when 'principal'       then 2
              when 'accountant'      then 3
              when 'student_affairs' then 4
              when 'teacher'         then 5
              when 'viewer'          then 6
              when 'guardian'        then 7
              when 'student'         then 8
              else 9
            end
   limit 1;

  if v_primary is not null then
    perform set_config('app.access_sync', 'on', true);
    update public.user u
       set role = v_primary
     where u.id = v_user_id
       and u.role is distinct from v_primary
       and u.role <> 'super_admin';
  end if;
  return null;
end;
$$;

create trigger role_assignment_sync_primary
  after insert or delete on public.role_assignment
  for each row execute function public.trg_role_assignment_sync_primary();

-- 6d. user_sync_primary_assignment (AFTER INSERT on user): a school user
--     inserted without assignments gets one equal to user.role. Keeps the
--     Phase 1 helper createAuthedUser and the super-admin's "create the
--     school's first admin" path working unchanged (FR-024, FR-036).
create or replace function public.trg_user_sync_primary_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role <> 'super_admin'
     and new.school_id is not null
     and not exists (select 1 from public.role_assignment ra where ra.user_id = new.id) then
    insert into public.role_assignment (user_id, school_id, role)
    values (new.id, new.school_id, new.role);
  end if;
  return null;
end;
$$;

create trigger user_sync_primary_assignment
  after insert on public.user
  for each row execute function public.trg_user_sync_primary_assignment();

-- 6e. user_guard_direct_changes (BEFORE UPDATE OR DELETE on user): the
--     super-admin's user_superadmin_all policy would otherwise bypass the role
--     model. service_role (fixtures, worker) is exempt.
create or replace function public.trg_user_guard_direct_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_service_caller() then
    return coalesce(new, old);
  end if;

  if tg_op = 'UPDATE' then
    if new.school_id is distinct from old.school_id
       or ((new.role is distinct from old.role or new.status is distinct from old.status)
           and coalesce(current_setting('app.access_sync', true), '') <> 'on') then
      raise exception 'DIRECT_ROLE_CHANGE_FORBIDDEN' using
        errcode = 'P0001',
        hint = 'تُعدّل أدوار المستخدمين وحالتهم من شاشة إدارة المستخدمين فقط.';
    end if;
    return new;
  end if;

  -- DELETE: never remove the last active school_admin of a school.
  if old.school_id is not null
     and old.status = 'active'
     and exists (select 1 from public.role_assignment ra
                  where ra.user_id = old.id and ra.role = 'school_admin')
     and not exists (
       select 1
         from public.role_assignment ra
         join public.user u on u.id = ra.user_id
        where ra.school_id = old.school_id
          and ra.role = 'school_admin'
          and u.status = 'active'
          and u.id <> old.id) then
    raise exception 'LAST_ADMIN_PROTECTED' using
      errcode = 'P0001',
      hint = 'لا يمكن حذف آخر مدير نشط للمدرسة.';
  end if;
  return old;
end;
$$;

create trigger user_guard_direct_changes
  before update or delete on public.user
  for each row execute function public.trg_user_guard_direct_changes();

-- Trigger functions are not part of the API.
revoke execute on function public.trg_role_assignment_guard() from public, anon, authenticated;
revoke execute on function public.trg_role_assignment_stage_guard() from public, anon, authenticated;
revoke execute on function public.trg_role_assignment_sync_primary() from public, anon, authenticated;
revoke execute on function public.trg_user_sync_primary_assignment() from public, anon, authenticated;
revoke execute on function public.trg_user_guard_direct_changes() from public, anon, authenticated;

-- ── 7. Backfill (US2-4, FR-018a): one school-wide assignment per school user ─
insert into public.role_assignment (user_id, school_id, role)
select u.id, u.school_id, u.role
  from public.user u
 where u.role <> 'super_admin'
   and u.school_id is not null
on conflict (user_id, role) do nothing;

-- ── 8. RLS (Article IV checklist) ───────────────────────────────────────────
-- Own rows only for now; the users.read policies are added in 0037 once
-- has_perm() exists. No write policy: writes go through definer functions.
alter table public.role_assignment enable row level security;
alter table public.role_assignment force row level security;
alter table public.role_assignment_stage enable row level security;
alter table public.role_assignment_stage force row level security;

create policy "role_assignment_own_select"
  on public.role_assignment for select to authenticated
  using (user_id = (select auth.uid()));

create policy "role_assignment_stage_own_select"
  on public.role_assignment_stage for select to authenticated
  using (exists (
    select 1 from public.role_assignment ra
     where ra.id = assignment_id and ra.user_id = (select auth.uid())));

revoke all on table public.role_assignment from anon, authenticated;
revoke all on table public.role_assignment_stage from anon, authenticated;
grant select on table public.role_assignment to authenticated;
grant select on table public.role_assignment_stage to authenticated;

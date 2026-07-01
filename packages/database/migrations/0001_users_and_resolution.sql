-- ============================================================================
-- 0001_users_and_resolution
-- Users, role model, and the tenant-resolution SQL helpers every RLS policy
-- depends on. Touches RLS ⇒ OWNER REVIEW before apply (Article XII).
-- ============================================================================

-- Roles (Article IV four-role model).
create type public.user_role as enum (
  'super_admin',
  'school_admin',
  'accountant',
  'viewer'
);

-- Application user. id mirrors the Supabase Auth uid. school_id is NULL only
-- for super_admin; every other role belongs to exactly one school.
create table public.user (
  id           uuid primary key references auth.users (id) on delete cascade,
  role         public.user_role not null,
  school_id    uuid,
  display_name text not null,
  created_at   timestamptz not null default now(),
  constraint user_school_required_for_tenant
    check (role = 'super_admin' or school_id is not null),
  constraint user_super_admin_has_no_school
    check (role <> 'super_admin' or school_id is null)
);

create index user_school_id_idx on public.user (school_id);

-- ── Tenant-resolution helpers ───────────────────────────────────────────────
-- SECURITY DEFINER so they bypass RLS on public.user (avoids policy recursion);
-- STABLE so the planner can cache within a statement. These are the single
-- authority every policy uses to resolve the caller's school + role.

create or replace function public.current_school_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select u.school_id from public.user u where u.id = auth.uid();
$$;

create or replace function public.current_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select u.role from public.user u where u.id = auth.uid();
$$;

comment on function public.current_school_id() is
  'Resolves the calling user''s school_id from the user table (RLS authority).';
comment on function public.current_role() is
  'Resolves the calling user''s role from the user table (RLS authority).';

-- ── RLS on public.user ──────────────────────────────────────────────────────
alter table public.user enable row level security;
alter table public.user force row level security;

-- A user can always read their own row (base case — no helper recursion).
create policy "user_self_select"
  on public.user for select to authenticated
  using (id = auth.uid());

-- School admins can read users within their own school.
create policy "user_same_school_select"
  on public.user for select to authenticated
  using (
    public.current_role() = 'school_admin'
    and school_id = public.current_school_id()
  );

-- Super-admin manages the user directory (they hold no school; excluded from
-- financial tables elsewhere).
create policy "user_superadmin_all"
  on public.user for all to authenticated
  using (public.current_role() = 'super_admin')
  with check (public.current_role() = 'super_admin');

grant select on public.user to authenticated;
grant execute on function public.current_school_id() to authenticated;
grant execute on function public.current_role() to authenticated;

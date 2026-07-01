-- ============================================================================
-- Reusable tenant-isolation template (Article IV). NOT applied directly — copy
-- into a concrete migration, replacing {{TABLE}}. Default-deny: enabling RLS
-- with no permissive policy denies all access; the policy below re-grants only
-- same-school rows. Financial tables additionally exclude super-admin (see the
-- financial-walloff migration).
--
-- Relies on the JWT-reading helpers current_school_id() / current_role()
-- created in 0001_users_and_resolution.sql.
-- ============================================================================

-- 1) Enable + FORCE row level security (default-deny).
alter table public.{{TABLE}} enable row level security;
alter table public.{{TABLE}} force row level security;

-- 2) Same-school read/write for authenticated tenant users.
create policy "{{TABLE}}_tenant_rw"
  on public.{{TABLE}}
  for all
  to authenticated
  using (school_id = public.current_school_id())
  with check (school_id = public.current_school_id());

-- 3) Minimal grants (RLS still filters rows; GRANT is the coarse gate).
grant select, insert, update, delete on public.{{TABLE}} to authenticated;

-- NOTE: financial/immutable tables should NOT grant update/delete to
-- authenticated (append-only, Article III) — grant select, insert only, and
-- perform all writes through SECURITY DEFINER money functions.

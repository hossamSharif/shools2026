-- ============================================================================
-- Role-aware tenant RLS template (Article IV + Article XIV, feature 002).
-- NOT applied directly: copy into a concrete migration and replace
-- {{TABLE}}, {{READ_KEY}} and {{WRITE_KEY}} (permission keys from
-- contracts/access-matrix.md; add new keys to the catalogue through a new
-- migration and to @erp/shared/access).
--
-- FORBIDDEN (FR-020): a policy whose only condition is
--   school_id = current_school_id()
-- ("any signed-in user of the school"). Every tenant policy MUST also require a
-- permission key (or a relationship helper). audit_access_policies() reports
-- such a policy as `signed_in_only_policy` and the policy-audit test fails.
--
-- Always call the helpers as (select public.fn(...)) so Postgres evaluates them
-- once per statement as an init-plan (research R13).
--
-- Financial / append-only tables (Article III): drop the insert/update/delete
-- policies and grants below; write only through SECURITY DEFINER functions
-- that call public.assert_perm('finance.write').
-- ============================================================================

-- 1) Enable + FORCE row level security (default-deny).
alter table public.{{TABLE}} enable row level security;
alter table public.{{TABLE}} force row level security;

-- 2) One policy per command, each requiring a permission key.
create policy "{{TABLE}}_select"
  on public.{{TABLE}}
  for select
  to authenticated
  using (
    school_id = (select public.current_school_id())
    and (select public.has_perm('{{READ_KEY}}'))
  );

create policy "{{TABLE}}_insert"
  on public.{{TABLE}}
  for insert
  to authenticated
  with check (
    school_id = (select public.current_school_id())
    and (select public.has_perm('{{WRITE_KEY}}'))
  );

create policy "{{TABLE}}_update"
  on public.{{TABLE}}
  for update
  to authenticated
  using (
    school_id = (select public.current_school_id())
    and (select public.has_perm('{{WRITE_KEY}}'))
  )
  with check (
    school_id = (select public.current_school_id())
    and (select public.has_perm('{{WRITE_KEY}}'))
  );

create policy "{{TABLE}}_delete"
  on public.{{TABLE}}
  for delete
  to authenticated
  using (
    school_id = (select public.current_school_id())
    and (select public.has_perm('{{WRITE_KEY}}'))
  );

-- 3) Explicit grants (RLS still filters rows; a GRANT is only the coarse gate).
--    No grant to anon on any tenant table (Article XVII).
grant select, insert, update, delete on public.{{TABLE}} to authenticated;

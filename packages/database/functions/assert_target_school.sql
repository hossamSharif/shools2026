-- ── Guard helper ────────────────────────────────────────────────────────────
-- Raises FORBIDDEN_SCHOOL when the target row's school is not the caller's.
-- p_school_id NULL means the target id does not exist ⇒ no-op (keeps the
-- Phase 1 empty/NULL result; nothing about another school is revealed).
-- service_role (the worker) and direct DB sessions without a JWT are trusted.
create or replace function public.assert_target_school(p_school_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_jwt_role text := coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    nullif(current_setting('request.jwt.claim.role', true), ''));
begin
  if p_school_id is null then
    return;
  end if;
  if v_jwt_role is null or v_jwt_role = 'service_role' then
    return;
  end if;
  if p_school_id is distinct from public.current_school_id() then
    raise exception 'FORBIDDEN_SCHOOL' using
      errcode = 'P0001',
      hint = 'لا تملك صلاحية الوصول لبيانات هذه المدرسة.';
  end if;
end;
$$;

comment on function public.assert_target_school(uuid) is
  'Hotfix 0032a: refuse a target id that belongs to another school (FORBIDDEN_SCHOOL).';

revoke execute on function public.assert_target_school(uuid) from public, anon;
grant execute on function public.assert_target_school(uuid) to authenticated, service_role;

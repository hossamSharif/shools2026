-- ============================================================================
-- 0026_user_self_profile
-- Lets any authenticated user update their OWN display_name. public.user has a
-- self-SELECT policy but no self-UPDATE policy (only super_admin can write), so
-- school_admin/accountant/viewer cannot rename themselves. A broad self-UPDATE
-- RLS policy would allow role/school_id escalation, so instead expose a narrow
-- SECURITY DEFINER RPC that only ever touches display_name for auth.uid().
-- Touches public.user surface ⇒ OWNER REVIEW before apply (Article XII).
-- ============================================================================

create or replace function public.update_own_display_name(p_display_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_display_name is null or length(btrim(p_display_name)) = 0 then
    raise exception 'display_name required';
  end if;

  update public.user
     set display_name = btrim(p_display_name)
   where id = auth.uid();
end;
$$;

comment on function public.update_own_display_name(text) is
  'Self-service rename: updates display_name for the calling user only (auth.uid()). '
  'Cannot change role or school_id — no escalation surface.';

revoke all on function public.update_own_display_name(text) from public;
grant execute on function public.update_own_display_name(text) to authenticated;

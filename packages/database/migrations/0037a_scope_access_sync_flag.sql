-- ============================================================================
-- 0037a_scope_access_sync_flag (spec 002, data-model §2). Forward fix for 0034.
-- TOUCHES THE ROLE MODEL ⇒ OWNER REVIEW before apply (Article XII).
--
-- Defect (found in live verification of T022): trg_role_assignment_sync_primary
-- set `app.access_sync = 'on'` with transaction scope and never cleared it.
-- After any role_assignment insert/delete, the rest of that transaction could
-- change user.role / user.status directly without user_guard_direct_changes
-- refusing it (school_id changes were still refused). A plain PostgREST
-- request is not affected, since authenticated cannot write role_assignment,
-- but the bypass must be limited to the trigger's own UPDATE.
--
-- Fix: save the previous value, turn the flag on only around the UPDATE, and
-- restore the previous value afterwards. The user-management definer
-- functions (0044) must use the same save/restore pattern.
-- ============================================================================

create or replace function public.trg_role_assignment_sync_primary()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := coalesce(new.user_id, old.user_id);
  v_primary public.user_role;
  v_prev    text;
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
    v_prev := coalesce(current_setting('app.access_sync', true), '');
    perform set_config('app.access_sync', 'on', true);
    update public.user u
       set role = v_primary
     where u.id = v_user_id
       and u.role is distinct from v_primary
       and u.role <> 'super_admin';
    perform set_config('app.access_sync', v_prev, true);
  end if;
  return null;
end;
$$;

revoke execute on function public.trg_role_assignment_sync_primary() from public, anon, authenticated;

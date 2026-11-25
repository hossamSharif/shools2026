-- ============================================================================
-- 0040_notification_recipients (spec 002, rpc-contracts §E, tasks T031).
-- Touches definer functions read by RLS-protected flows ⇒ OWNER REVIEW (XII).
--
-- The two emitters picked recipients with `user.role in ('school_admin',
-- 'accountant')`. user.role is now only a denormalised primary role and must
-- not be used for authorization (research R2, R11). Recipients are now the
-- school's ACTIVE users whose effective permissions include finance.write,
-- resolved from role_assignment + role_permission_default + enabled optional
-- switches.
--
-- Why finance.write (not finance.read, which rpc-contracts §E mentions): in
-- every Phase 1 school the finance.write holders are exactly school_admin +
-- accountant, i.e. exactly the Phase 1 recipients, so nobody gains or loses a
-- notification (US2). finance.read would newly include viewers.
--
-- check_low_sms_credit now reads the balance through sms_credit_balance_unchecked
-- (0039): it runs for the worker and must not depend on the caller's keys.
-- The payment_recorded notification (apply_fee_payment) still goes to the
-- acting user and is unchanged.
-- Source mirror: packages/database/functions/emit_notifications.sql.
-- ============================================================================

-- Internal: active users of a school holding a key through any of their roles.
create or replace function public.school_users_with_perm(p_school_id uuid, p_key text)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select distinct u.id
    from public.user u
    join public.role_assignment ra on ra.user_id = u.id and ra.school_id = u.school_id
   where u.school_id = p_school_id
     and u.status = 'active'
     and (exists (select 1 from public.role_permission_default d
                   where d.role = ra.role and d.permission_key = p_key)
          or exists (select 1
                       from public.optional_permission o
                       left join public.school_role_permission s
                              on s.school_id = p_school_id
                             and s.role = o.role
                             and s.permission_key = o.permission_key
                      where o.role = ra.role
                        and o.permission_key = p_key
                        and coalesce(s.enabled, o.default_enabled)));
$$;

comment on function public.school_users_with_perm(uuid, text) is
  'Internal: active users of the school whose effective permissions include the key.';

revoke execute on function public.school_users_with_perm(uuid, text) from public, anon, authenticated;
grant execute on function public.school_users_with_perm(uuid, text) to service_role;

create or replace function public.check_low_sms_credit(p_school_id uuid, p_threshold int default 20)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance int;
  v_today   date;
  v_user    record;
begin
  v_balance := public.sms_credit_balance_unchecked(p_school_id);
  if v_balance > p_threshold then
    return;
  end if;

  v_today := (now() at time zone 'Africa/Khartoum')::date;

  for v_user in
    select r.id from public.school_users_with_perm(p_school_id, 'finance.write') as r(id)
  loop
    if not exists (
      select 1 from public.notification
       where school_id = p_school_id
         and user_id = v_user.id
         and type = 'low_sms_credit'
         and (created_at at time zone 'Africa/Khartoum')::date = v_today
    ) then
      perform public.emit_notification(
        p_school_id, v_user.id, 'low_sms_credit',
        jsonb_build_object('balance', v_balance, 'threshold', p_threshold));
    end if;
  end loop;
end;
$$;

revoke execute on function public.check_low_sms_credit(uuid, int) from public, anon, authenticated;
grant execute on function public.check_low_sms_credit(uuid, int) to service_role;

create or replace function public.emit_expiry_notifications(p_within_days int default 7)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today   date;
  v_school  record;
  v_user    record;
  v_count   int := 0;
begin
  v_today := (now() at time zone 'Africa/Khartoum')::date;

  for v_school in
    select distinct on (s.school_id) s.school_id, s.period_end
      from public.subscription s
     where s.period_end >= v_today
       and s.period_end <= v_today + p_within_days
     order by s.school_id, s.period_end desc
  loop
    for v_user in
      select r.id from public.school_users_with_perm(v_school.school_id, 'finance.write') as r(id)
    loop
      if not exists (
        select 1 from public.notification
         where school_id = v_school.school_id
           and user_id = v_user.id
           and type = 'subscription_expiring'
           and (created_at at time zone 'Africa/Khartoum')::date = v_today
      ) then
        perform public.emit_notification(
          v_school.school_id, v_user.id, 'subscription_expiring',
          jsonb_build_object(
            'period_end', v_school.period_end,
            'days_remaining', v_school.period_end - v_today));
        v_count := v_count + 1;
      end if;
    end loop;
  end loop;

  return v_count;
end;
$$;

revoke execute on function public.emit_expiry_notifications(int) from public, anon, authenticated;
grant execute on function public.emit_expiry_notifications(int) to service_role;

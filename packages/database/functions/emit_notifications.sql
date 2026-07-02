-- ============================================================================
-- emit_notifications (US9) — low-credit and expiring-soon notification helpers.
-- `payment_recorded` is emitted inline from apply_fee_payment.sql (T132); this
-- file covers the other two triggers. Both are additive/internal and safe to
-- call repeatedly (each guards against duplicate notifications per period).
-- ============================================================================

-- sms_credit_balance — same derivation the SMS package uses: Σtopups −
-- Σconsumptions (Article II, never stored). Kept here (rather than duplicated)
-- so both the low-credit check and any future SMS UI can share one definition;
-- if packages/database/functions/consume_sms_credit.sql (US7, developed in
-- parallel) already defines this, this CREATE OR REPLACE is a harmless no-op
-- (same signature/semantics).
create or replace function public.sms_credit_balance(p_school_id uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select sum(amount) from public.sms_credit_topup where school_id = p_school_id), 0)
       - coalesce((select sum(segments) from public.sms_credit_consumption where school_id = p_school_id), 0);
$$;

grant execute on function public.sms_credit_balance(uuid) to authenticated;

-- check_low_sms_credit — call after any consumption. Notifies every non-viewer
-- user of the school once the balance drops at/below p_threshold, at most once
-- per calendar day (Africa/Khartoum) to avoid spamming the bell on every SMS.
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
  v_balance := public.sms_credit_balance(p_school_id);
  if v_balance > p_threshold then
    return;
  end if;

  v_today := (now() at time zone 'Africa/Khartoum')::date;

  for v_user in
    select id from public.user
     where school_id = p_school_id and role in ('school_admin', 'accountant')
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

revoke execute on function public.check_low_sms_credit(uuid, int) from public, anon;
grant execute on function public.check_low_sms_credit(uuid, int) to authenticated;

-- emit_expiry_notifications — called from the cron job
-- (packages/api/src/cron/expiry-notifications.ts). Notifies every non-viewer
-- user of schools whose subscription expires within p_within_days, once per
-- calendar day (Africa/Khartoum) per school.
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
      select id from public.user
       where school_id = v_school.school_id and role in ('school_admin', 'accountant')
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

comment on function public.emit_expiry_notifications(int) is
  'Cron entry point (packages/api/src/cron/expiry-notifications.ts): notifies school_admin/accountant users of schools expiring within N days, once/day.';

-- Not exposed to clients: invoked by the cron worker via the service role.
revoke execute on function public.emit_expiry_notifications(int) from public, anon, authenticated;

-- ============================================================================
-- 0032a_harden_finance_definer_exposure — HOTFIX (spec 002, rpc-contracts §E0).
-- MONEY-MIGRATION ⇒ OWNER REVIEW before apply (Article XII). Ships on its own,
-- ahead of the rest of feature 002.
--
-- Closes three Phase 1 exposures found in /speckit-analyze (repo source; confirm
-- the live ACLs with Supabase MCP first, task T008):
--   1. EXECUTE still granted to PUBLIC (hence anon) on finance definer functions.
--   2. Finance definer functions that take a school/student/account/installment
--      id never checked it belongs to the caller's school, so a School A user
--      could read School B's figures (Article IV).
--   3. Internal-only functions (credit debit, low-credit notifications,
--      installment generation) were executable by any signed-in user (Articles IV, VII).
--
-- Function bodies are copied unchanged from their latest source; the only change
-- is a leading public.assert_target_school(...) call. SQL-language functions are
-- converted to plpgsql solely so they can raise. Signatures, return types and
-- results for same-school callers are identical. An unknown id still returns the
-- Phase 1 empty/NULL result.
-- ============================================================================

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

-- ── 2. Target-school check in every finance definer function that takes an id ──

-- ── dashboard_kpis (latest: functions/dashboard_kpis.sql = 0023) ──
create or replace function public.dashboard_kpis(p_school_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today       date := (now() at time zone 'Africa/Khartoum')::date;
  v_month_start date := date_trunc('month', v_today)::date;
  v_year_start  date := date_trunc('year', v_today)::date;
  v_accounts    jsonb;
  v_combined_balance     numeric(14,2);
  v_collected_month      numeric(14,2);
  v_collected_year       numeric(14,2);
  v_billed_month         numeric(14,2);
  v_outstanding          numeric(14,2);
  v_collection_rate      numeric(6,2);
  v_expenses_month       numeric(14,2);
  v_net_cash_flow_month  numeric(14,2);
  v_overdue_count        int;
  v_sms_credit_remaining int;
begin
  -- 0032a: refuse ids of another school (rpc-contracts §E0).
  perform public.assert_target_school(p_school_id);

  -- Per-account + combined balance.
  select coalesce(jsonb_agg(jsonb_build_object(
           'account_id', a.id,
           'name', a.name,
           'type', a.type,
           'balance', public.account_balance(a.id)
         ) order by a.name), '[]'::jsonb),
         coalesce(sum(public.account_balance(a.id)), 0)
    into v_accounts, v_combined_balance
    from public.account a
   where a.school_id = p_school_id;

  -- Collected (fee_payment money-in), month-to-date and year-to-date.
  select coalesce(sum(e.amount * case when e.reverses_event_id is null then 1 else -1 end)
           filter (where e.occurred_at::date >= v_month_start), 0),
         coalesce(sum(e.amount * case when e.reverses_event_id is null then 1 else -1 end)
           filter (where e.occurred_at::date >= v_year_start), 0)
    into v_collected_month, v_collected_year
    from public.money_event e
   where e.school_id = p_school_id and e.event_type = 'fee_payment';

  -- Billed this month (installments due in the current month) — collection-rate denominator.
  select coalesce(sum(i.amount_charged), 0)
    into v_billed_month
    from public.installment i
   where i.school_id = p_school_id
     and i.due_date >= v_month_start
     and i.due_date < (v_month_start + interval '1 month');

  v_collection_rate := case when v_billed_month > 0
    then round(least(v_collected_month / v_billed_month, 1) * 100, 2)
    else 0 end;

  -- Outstanding receivables: sum of positive installment running balances.
  select coalesce(sum(public.installment_running_balance(i.id)), 0)
    into v_outstanding
    from public.installment i
   where i.school_id = p_school_id;

  -- Monthly expenses.
  select coalesce(sum(e.amount * case when e.reverses_event_id is null then 1 else -1 end), 0)
    into v_expenses_month
    from public.money_event e
   where e.school_id = p_school_id
     and e.event_type = 'expense'
     and e.occurred_at::date >= v_month_start;

  v_net_cash_flow_month := v_collected_month - v_expenses_month;

  -- Overdue-student count (distinct students with an overdue outstanding balance).
  select count(distinct i.student_id)
    into v_overdue_count
    from public.installment i
   where i.school_id = p_school_id
     and i.due_date < v_today
     and public.installment_running_balance(i.id) > 0;

  -- SMS credit remaining (already derived elsewhere; reused here).
  v_sms_credit_remaining := public.sms_credit_balance(p_school_id);

  return jsonb_build_object(
    'accounts', v_accounts,
    'combined_balance', v_combined_balance,
    'collected_month', v_collected_month,
    'collected_year', v_collected_year,
    'outstanding', v_outstanding,
    'collection_rate', v_collection_rate,
    'expenses_month', v_expenses_month,
    'net_cash_flow_month', v_net_cash_flow_month,
    'overdue_count', v_overdue_count,
    'sms_credit_remaining', v_sms_credit_remaining
  );
end;
$$;

-- ── receivables_aging (latest: 0025_fix_receivables_aging_order_by) ──
create or replace function public.receivables_aging(
  p_school_id  uuid,
  p_stage_id   uuid default null,
  p_grade_id   uuid default null,
  p_section_id uuid default null
)
returns table (
  student_id      uuid,
  student_name    text,
  status          text,
  grade_id        uuid,
  grade_label     text,
  section_id      uuid,
  section_name    text,
  current_amount  numeric(14,2),
  bucket_1_30     numeric(14,2),
  bucket_31_60    numeric(14,2),
  bucket_61_90    numeric(14,2),
  bucket_90_plus  numeric(14,2),
  total_owed      numeric(14,2)
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Africa/Khartoum')::date;
begin
  -- 0032a: refuse ids of another school (rpc-contracts §E0).
  perform public.assert_target_school(p_school_id);

  return query
  with latest_enrollment as (
    select distinct on (en.student_id)
           en.student_id, en.grade_id, en.section_id
      from public.enrollment en
     where en.school_id = p_school_id
     order by en.student_id, en.created_at desc
  ),
  outstanding as (
    select i.student_id,
           i.due_date,
           public.installment_running_balance(i.id) as owed
      from public.installment i
     where i.school_id = p_school_id
  ),
  bucketed as (
    select o.student_id,
           case when o.due_date >= v_today then o.owed else 0 end as current_amount,
           case when o.due_date < v_today and (v_today - o.due_date) between 1 and 30
                then o.owed else 0 end as bucket_1_30,
           case when o.due_date < v_today and (v_today - o.due_date) between 31 and 60
                then o.owed else 0 end as bucket_31_60,
           case when o.due_date < v_today and (v_today - o.due_date) between 61 and 90
                then o.owed else 0 end as bucket_61_90,
           case when o.due_date < v_today and (v_today - o.due_date) > 90
                then o.owed else 0 end as bucket_90_plus
      from outstanding o
     where o.owed > 0
  ),
  agg as (
    select b.student_id,
           sum(b.current_amount)  as current_amount,
           sum(b.bucket_1_30)     as bucket_1_30,
           sum(b.bucket_31_60)    as bucket_31_60,
           sum(b.bucket_61_90)    as bucket_61_90,
           sum(b.bucket_90_plus)  as bucket_90_plus
      from bucketed b
     group by b.student_id
    having sum(b.current_amount + b.bucket_1_30 + b.bucket_31_60 + b.bucket_61_90 + b.bucket_90_plus) > 0
  )
  select s.id, s.name, s.status::text,
         g.id, g.label_ar,
         sec.id, sec.name,
         a.current_amount, a.bucket_1_30, a.bucket_31_60, a.bucket_61_90, a.bucket_90_plus,
         (a.current_amount + a.bucket_1_30 + a.bucket_31_60 + a.bucket_61_90 + a.bucket_90_plus)
           as total_owed
    from agg a
    join public.student s on s.id = a.student_id
    left join latest_enrollment le on le.student_id = s.id
    left join public.grade g on g.id = le.grade_id
    left join public.section sec on sec.id = le.section_id
   where s.school_id = p_school_id
     and (p_grade_id is null or g.id = p_grade_id)
     and (p_section_id is null or sec.id = p_section_id)
     and (p_stage_id is null or g.stage_id = p_stage_id)
   order by total_owed desc, s.name;
end;
$$;

-- ── student_statement (latest: functions/student_statement.sql = 0021) ──
create or replace function public.student_statement(p_student_id uuid)
returns table (
  entry_date       timestamptz,
  entry_type       text,
  description      text,
  charge           numeric(14,2),
  credit           numeric(14,2),
  running_balance  numeric(14,2)
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  -- 0032a: refuse ids of another school (rpc-contracts §E0).
  perform public.assert_target_school((select s.school_id from public.student s where s.id = p_student_id));

  return query
  with entries as (
      -- Installment charges (what the student was billed).
      select i.due_date::timestamptz as entry_date,
             'charge'::text as entry_type,
             coalesce('قسط رقم ' || i.sequence, 'قسط') as description,
             i.amount_charged as charge,
             0::numeric(14,2) as credit
        from public.installment i
       where i.student_id = p_student_id

      union all

      -- Payments allocated to this student's installments (money in, reduces owed).
      select e.occurred_at,
             'payment',
             'دفعة - إيصال رقم ' || coalesce(e.receipt_no::text, ''),
             0::numeric(14,2),
             pa.amount
        from public.payment_allocation pa
        join public.installment i on i.id = pa.installment_id
        join public.money_event e on e.id = pa.money_event_id
       where i.student_id = p_student_id
         and e.reverses_event_id is null
         and not exists (select 1 from public.money_event r where r.reverses_event_id = e.id)

      union all

      -- Discounts (non-cash reduction of what's owed).
      select d.created_at,
             'discount',
             coalesce(d.reason, 'خصم'),
             0::numeric(14,2),
             d.computed_amount
        from public.discount d
       where d.student_id = p_student_id

      union all

      -- Adjustments / write-offs (reduce owed; reversal flips the sign).
      select e.occurred_at,
             'adjustment',
             coalesce(e.notes, 'تسوية'),
             case when e.reverses_event_id is null then 0::numeric(14,2) else e.amount end,
             case when e.reverses_event_id is null then e.amount else 0::numeric(14,2) end
        from public.money_event e
       where e.student_id = p_student_id and e.event_type = 'adjustment'

      union all

      -- Refunds (money back to guardian; increases what's owed; reversal flips it).
      select e.occurred_at,
             'refund',
             coalesce(e.notes, 'استرداد'),
             case when e.reverses_event_id is null then e.amount else 0::numeric(14,2) end,
             case when e.reverses_event_id is null then 0::numeric(14,2) else e.amount end
        from public.money_event e
       where e.student_id = p_student_id and e.event_type = 'refund'
    )
    select entry_date, entry_type, description, charge, credit,
           sum(charge - credit) over (order by entry_date, entry_type
                                       rows between unbounded preceding and current row)
             as running_balance
      from entries
     order by entry_date, entry_type;
end;
$$;

-- ── account_balance (latest: functions/derived_balances_v2.sql) ──
create or replace function public.account_balance(p_account_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- 0032a: refuse ids of another school (rpc-contracts §E0).
  perform public.assert_target_school((select a.school_id from public.account a where a.id = p_account_id));

  return (
    select coalesce(a.opening_balance, 0)
           + coalesce((
               select sum(
                 case e.event_type
                   when 'fee_payment' then e.amount
                   when 'expense'     then -e.amount
                   when 'refund'      then -e.amount
                   else 0
                 end * case when e.reverses_event_id is null then 1 else -1 end)
               from public.money_event e
              where e.account_id = p_account_id
             ), 0)
           + coalesce((
               select sum(e.amount * case when e.reverses_event_id is null then 1 else -1 end)
                 from public.money_event e
                where e.event_type = 'transfer' and e.to_account_id = p_account_id
             ), 0)
           - coalesce((
               select sum(e.amount * case when e.reverses_event_id is null then 1 else -1 end)
                 from public.money_event e
                where e.event_type = 'transfer' and e.from_account_id = p_account_id
             ), 0)
      from public.account a
      where a.id = p_account_id
  );
end;
$$;

-- ── installment_running_balance (latest: functions/derived_balances_v2.sql) ──
create or replace function public.installment_running_balance(p_installment_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- 0032a: refuse ids of another school (rpc-contracts §E0).
  perform public.assert_target_school((select i.school_id from public.installment i where i.id = p_installment_id));

  return (
    select greatest(
        coalesce((select i.amount_charged from public.installment i where i.id = p_installment_id), 0)
        - coalesce((
            select sum(pa.amount)
              from public.payment_allocation pa
              join public.money_event e on e.id = pa.money_event_id
             where pa.installment_id = p_installment_id
               and e.reverses_event_id is null
               and not exists (select 1 from public.money_event r where r.reverses_event_id = e.id)
          ), 0)
        - coalesce((
            select sum(d.computed_amount)
              from public.discount d
             where d.installment_id = p_installment_id
          ), 0),
        0)
  );
end;
$$;

-- ── student_balance (latest: functions/derived_balances_v2.sql) ──
create or replace function public.student_balance(p_student_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- 0032a: refuse ids of another school (rpc-contracts §E0).
  perform public.assert_target_school((select s.school_id from public.student s where s.id = p_student_id));

  return (
    select coalesce((
               select sum(i.amount_charged) from public.installment i
                where i.student_id = p_student_id
             ), 0)
           - coalesce((
               select sum(pa.amount)
                 from public.payment_allocation pa
                 join public.installment i on i.id = pa.installment_id
                 join public.money_event e on e.id = pa.money_event_id
                where i.student_id = p_student_id
                  and e.reverses_event_id is null
                  and not exists (select 1 from public.money_event r where r.reverses_event_id = e.id)
             ), 0)
           - coalesce((
               select sum(d.computed_amount) from public.discount d
                where d.student_id = p_student_id
             ), 0)
           - coalesce((
               select sum(e.amount * case when e.reverses_event_id is null then 1 else -1 end)
                 from public.money_event e
                where e.student_id = p_student_id and e.event_type = 'adjustment'
             ), 0)
           + coalesce((
               select sum(e.amount * case when e.reverses_event_id is null then 1 else -1 end)
                 from public.money_event e
                where e.student_id = p_student_id and e.event_type = 'refund'
             ), 0)
  );
end;
$$;

-- ── sms_credit_balance (latest: functions/emit_notifications.sql) ──
create or replace function public.sms_credit_balance(p_school_id uuid)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- 0032a: refuse ids of another school (rpc-contracts §E0).
  perform public.assert_target_school(p_school_id);

  return (
    select coalesce((select sum(amount) from public.sms_credit_topup where school_id = p_school_id), 0)
           - coalesce((select sum(segments) from public.sms_credit_consumption where school_id = p_school_id), 0)
  );
end;
$$;

-- ── 1. No PUBLIC / anon EXECUTE on finance definer functions ────────────────
revoke execute on function public.dashboard_kpis(uuid) from public, anon;
revoke execute on function public.student_statement(uuid) from public, anon;
revoke execute on function public.receivables_aging(uuid, uuid, uuid, uuid) from public, anon;
revoke execute on function public.sms_credit_balance(uuid) from public, anon;
revoke execute on function public.mark_notification_read(uuid) from public, anon;
revoke execute on function public.account_balance(uuid) from public, anon;
revoke execute on function public.installment_running_balance(uuid) from public, anon;
revoke execute on function public.student_balance(uuid) from public, anon;

grant execute on function public.dashboard_kpis(uuid) to authenticated, service_role;
grant execute on function public.student_statement(uuid) to authenticated, service_role;
grant execute on function public.receivables_aging(uuid, uuid, uuid, uuid) to authenticated, service_role;
grant execute on function public.sms_credit_balance(uuid) to authenticated, service_role;
grant execute on function public.mark_notification_read(uuid) to authenticated;
grant execute on function public.account_balance(uuid) to authenticated, service_role;
grant execute on function public.installment_running_balance(uuid) to authenticated, service_role;
grant execute on function public.student_balance(uuid) to authenticated, service_role;

-- ── 3. Internal-only functions: worker (service_role) and triggers only ─────
-- Callers: @erp/api dispatch (consume_sms_credit, service client), the low-credit
-- check after dispatch and us9-notifications.spec.ts (service client), and the
-- enrollment_generate_installments trigger (runs as the definer owner, so it is
-- not affected by revoking EXECUTE from authenticated).
revoke execute on function public.consume_sms_credit(uuid, uuid, int, uuid) from public, anon, authenticated;
revoke execute on function public.check_low_sms_credit(uuid, int) from public, anon, authenticated;
revoke execute on function public.generate_installments(uuid) from public, anon, authenticated;

grant execute on function public.consume_sms_credit(uuid, uuid, int, uuid) to service_role;
grant execute on function public.check_low_sms_credit(uuid, int) to service_role;
grant execute on function public.generate_installments(uuid) to service_role;

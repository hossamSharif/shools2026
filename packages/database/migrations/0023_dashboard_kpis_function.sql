-- ============================================================================
-- dashboard_kpis (US6, T104)
-- One derived KPI bundle for the admin dashboard: per-account + combined
-- balance, collected (month/year), outstanding receivables, collection rate,
-- monthly expenses, net cash flow, overdue-student count, SMS credit
-- remaining. All windows evaluated in Africa/Khartoum (Article VIII); all
-- figures DERIVED from money_event/installment (Article II).
-- MONEY-ADJACENT (reads money data) ⇒ OWNER REVIEW (Article XII).
-- ============================================================================

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

comment on function public.dashboard_kpis(uuid) is
  'Derived admin-dashboard KPI bundle (balances, collected, outstanding, collection rate, expenses, net cash flow, overdue count, SMS credit) in Africa/Khartoum.';

grant execute on function public.dashboard_kpis(uuid) to authenticated;

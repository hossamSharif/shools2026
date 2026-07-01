-- ============================================================================
-- derived_balances (US3) — balances are ALWAYS derived from the event log
-- (Article II); nothing is stored editable. This is the Phase-5 baseline
-- (fee_payment / expense / refund on account_id); Phase 6 replaces it to add
-- transfers, discounts, adjustments. SECURITY DEFINER so reads compose inside
-- the money functions; tenant scope is enforced by the callers + RLS on reads.
-- ============================================================================

-- Live account balance = opening_balance + Σ signed events touching the account.
-- fee_payment = +amount (in); expense/refund = −amount (out); reversing entries
-- flip the sign of what they reverse.
create or replace function public.account_balance(p_account_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
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
  from public.account a
  where a.id = p_account_id;
$$;

-- Installment running balance = amount_charged − Σ allocated payments (≥ 0).
create or replace function public.installment_running_balance(p_installment_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select greatest(
    coalesce((select i.amount_charged from public.installment i where i.id = p_installment_id), 0)
    - coalesce((
        select sum(pa.amount)
          from public.payment_allocation pa
          join public.money_event e on e.id = pa.money_event_id
         where pa.installment_id = p_installment_id
           and e.reverses_event_id is null
      ), 0),
    0);
$$;

-- Student balance = Σ charges − Σ payments (Phase-5 baseline).
create or replace function public.student_balance(p_student_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
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
         ), 0);
$$;

grant execute on function public.account_balance(uuid) to authenticated;
grant execute on function public.installment_running_balance(uuid) to authenticated;
grant execute on function public.student_balance(uuid) to authenticated;

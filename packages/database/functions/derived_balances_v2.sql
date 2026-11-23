-- ============================================================================
-- derived_balances (US4 full) — replaces the Phase-5 baseline to include
-- transfers, discounts, refunds, and adjustments. Balances remain fully DERIVED
-- (Article II). Reversing entries flip the sign of what they reverse (Article III).
-- MONEY-MIGRATION ⇒ OWNER REVIEW (Article XII).
-- ============================================================================

-- Live account balance: opening + payments in − expenses/refunds out + transfers.
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

-- Installment running balance: charge − payments − discounts targeting it (≥ 0).
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

-- Student balance: Σ charges − Σ payments − Σ discounts − Σ write-offs + Σ refunds.
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

revoke execute on function public.account_balance(uuid) from public, anon;
revoke execute on function public.installment_running_balance(uuid) from public, anon;
revoke execute on function public.student_balance(uuid) from public, anon;
grant execute on function public.account_balance(uuid) to authenticated;
grant execute on function public.installment_running_balance(uuid) to authenticated;
grant execute on function public.student_balance(uuid) to authenticated;

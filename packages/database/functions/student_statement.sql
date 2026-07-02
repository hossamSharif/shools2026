-- ============================================================================
-- student_statement (US5, T096)
-- Ordered ledger of charges/discounts/payments/refunds/adjustments for a
-- student with a running balance, plus total owed. Fully DERIVED (Article II) —
-- reads only the append-only money_event log + installment + discount rows.
-- MONEY-ADJACENT (reads money data) ⇒ OWNER REVIEW (Article XII).
-- ============================================================================

create or replace function public.student_statement(p_student_id uuid)
returns table (
  entry_date       timestamptz,
  entry_type       text,
  description      text,
  charge           numeric(14,2),
  credit           numeric(14,2),
  running_balance  numeric(14,2)
)
language sql
stable
security definer
set search_path = public
as $$
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
$$;

comment on function public.student_statement(uuid) is
  'Derived, ordered statement (charges/payments/discounts/refunds/adjustments) with running balance for a student.';

grant execute on function public.student_statement(uuid) to authenticated;

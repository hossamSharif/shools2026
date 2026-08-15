-- ============================================================================
-- 0029_student_profile_functions (students section enhancement)
-- Read functions backing the student profile / statement screen:
--   student_financial_summary — the header figures + next-due + aging
--   student_installments      — the installment schedule with per-row status
--   student_payments          — the receipt history (reversals kept, flagged)
-- All fully DERIVED (Article II) — nothing stored, no money math in JS
-- (Article VI). "Today" in Africa/Khartoum (Article VIII).
-- MONEY-ADJACENT (reads money data) ⇒ OWNER REVIEW (Article XII).
-- ============================================================================

-- ── Summary ─────────────────────────────────────────────────────────────────
create or replace function public.student_financial_summary(p_student_id uuid)
returns table (
  total_charged        numeric(14,2),
  total_discount       numeric(14,2),
  total_paid           numeric(14,2),
  total_refunded       numeric(14,2),
  total_adjusted       numeric(14,2),
  total_owed           numeric(14,2),
  collection_rate      numeric(5,2),
  installments_total   int,
  installments_settled int,
  next_due_date        date,
  next_due_amount      numeric(14,2),
  overdue_amount       numeric(14,2),
  days_overdue         int,
  oldest_overdue_date  date
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Africa/Khartoum')::date;
begin
  -- RLS is bypassed under SECURITY DEFINER; re-assert the tenant boundary.
  if not exists (
    select 1 from public.student s
     where s.id = p_student_id and s.school_id = public.current_school_id()
  ) then
    raise exception 'FORBIDDEN_STUDENT' using hint = 'الطالب لا ينتمي لمدرستك.';
  end if;

  return query
  with inst as (
    select i.due_date,
           i.amount_charged,
           public.installment_running_balance(i.id) as remaining
      from public.installment i
     where i.student_id = p_student_id
  ),
  agg as (
    select coalesce(sum(x.amount_charged), 0)::numeric(14,2)               as charged,
           count(*)::int                                                   as n_total,
           count(*) filter (where x.remaining = 0)::int                    as n_settled,
           coalesce(sum(x.remaining) filter (where x.due_date < v_today), 0)::numeric(14,2) as overdue,
           min(x.due_date) filter (where x.remaining > 0 and x.due_date < v_today) as oldest_overdue,
           min(x.due_date) filter (where x.remaining > 0)                  as next_due
      from inst x
  ),
  nxt as (
    select coalesce(sum(x.remaining), 0)::numeric(14,2) as next_amount
      from inst x, agg
     where x.due_date = agg.next_due and x.remaining > 0
  ),
  -- Cash actually received. NOT `charged - remaining`:
  -- installment_running_balance already nets out discounts, which are a
  -- non-cash reduction (Article III) reported on their own line below.
  pay as (
    select coalesce(sum(pa.amount), 0)::numeric(14,2) as paid
      from public.payment_allocation pa
      join public.installment i on i.id = pa.installment_id
      join public.money_event e on e.id = pa.money_event_id
     where i.student_id = p_student_id
       and e.reverses_event_id is null
       and not exists (select 1 from public.money_event r where r.reverses_event_id = e.id)
  ),
  d as (
    select coalesce(sum(dd.computed_amount), 0)::numeric(14,2) as discount
      from public.discount dd
     where dd.student_id = p_student_id
  ),
  -- Refunds and adjustments are net of their reversals (a reversing row carries
  -- reverses_event_id and cancels the original out).
  ev as (
    select coalesce(sum(case when e.event_type = 'refund'
                             then case when e.reverses_event_id is null then e.amount else -e.amount end
                        end), 0)::numeric(14,2) as refunded,
           coalesce(sum(case when e.event_type = 'adjustment'
                             then case when e.reverses_event_id is null then e.amount else -e.amount end
                        end), 0)::numeric(14,2) as adjusted
      from public.money_event e
     where e.student_id = p_student_id
       and e.event_type in ('refund', 'adjustment')
  )
  select agg.charged,
         d.discount,
         pay.paid,
         ev.refunded,
         ev.adjusted,
         -- Canonical whole-ledger balance (charges − payments − discounts
         -- − adjustments + refunds), reused rather than re-derived (Article II).
         public.student_balance(p_student_id)::numeric(14,2),
         case when agg.charged > 0
              then round((pay.paid / agg.charged) * 100, 2)::numeric(5,2)
              else 0::numeric(5,2) end,
         agg.n_total,
         agg.n_settled,
         agg.next_due,
         nxt.next_amount,
         agg.overdue,
         coalesce((v_today - agg.oldest_overdue), 0)::int,
         agg.oldest_overdue
    from agg, nxt, pay, d, ev;
end;
$$;

comment on function public.student_financial_summary(uuid) is
  'Derived financial header for one student: charged/discount/paid/refunded/adjusted/owed, collection rate, installment counts, next due, and overdue aging.';

-- ── Installment schedule ────────────────────────────────────────────────────
create or replace function public.student_installments(p_student_id uuid)
returns table (
  installment_id   uuid,
  sequence         int,
  due_date         date,
  amount_charged   numeric(14,2),
  amount_paid      numeric(14,2),
  amount_discount  numeric(14,2),
  remaining        numeric(14,2),
  is_carried_in    boolean,
  status           text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Africa/Khartoum')::date;
begin
  if not exists (
    select 1 from public.student s
     where s.id = p_student_id and s.school_id = public.current_school_id()
  ) then
    raise exception 'FORBIDDEN_STUDENT' using hint = 'الطالب لا ينتمي لمدرستك.';
  end if;

  return query
  with rows_out as (
    select i.id                                              as installment_id,
           i.sequence                                        as sequence,
           i.due_date                                        as due_date,
           i.amount_charged                                  as amount_charged,
           coalesce((
             select sum(pa.amount)
               from public.payment_allocation pa
               join public.money_event e on e.id = pa.money_event_id
              where pa.installment_id = i.id
                and e.reverses_event_id is null
                and not exists (select 1 from public.money_event r
                                 where r.reverses_event_id = e.id)
           ), 0)::numeric(14,2)                              as amount_paid,
           coalesce((
             select sum(dd.computed_amount) from public.discount dd
              where dd.installment_id = i.id
           ), 0)::numeric(14,2)                              as amount_discount,
           public.installment_running_balance(i.id)::numeric(14,2) as remaining,
           i.is_carried_in                                   as is_carried_in
      from public.installment i
     where i.student_id = p_student_id
  )
  select r.installment_id, r.sequence, r.due_date, r.amount_charged,
         r.amount_paid, r.amount_discount, r.remaining, r.is_carried_in,
         case
           when r.remaining = 0        then 'paid'
           when r.due_date < v_today   then 'overdue'
           when r.amount_paid > 0 or r.amount_discount > 0 then 'partial'
           else 'upcoming'
         end
    from rows_out r
   order by r.due_date, r.sequence;
end;
$$;

comment on function public.student_installments(uuid) is
  'Per-installment schedule for a student with derived paid/remaining and a paid|partial|overdue|upcoming status (Africa/Khartoum clock).';

-- ── Payment history ─────────────────────────────────────────────────────────
create or replace function public.student_payments(p_student_id uuid)
returns table (
  money_event_id uuid,
  receipt_no     int,
  occurred_at    timestamptz,
  amount         numeric(14,2),
  account_name   text,
  is_reversal    boolean,
  is_reversed    boolean,
  notes          text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.student s
     where s.id = p_student_id and s.school_id = public.current_school_id()
  ) then
    raise exception 'FORBIDDEN_STUDENT' using hint = 'الطالب لا ينتمي لمدرستك.';
  end if;

  return query
  select e.id,
         e.receipt_no,
         e.occurred_at,
         -- The amount actually applied to this student's installments.
         sum(pa.amount)::numeric(14,2),
         acc.name,
         e.reverses_event_id is not null,
         exists (select 1 from public.money_event r where r.reverses_event_id = e.id),
         e.notes
    from public.payment_allocation pa
    join public.installment i  on i.id = pa.installment_id
    join public.money_event e  on e.id = pa.money_event_id
    left join public.account acc on acc.id = e.account_id
   where i.student_id = p_student_id
   group by e.id, e.receipt_no, e.occurred_at, acc.name, e.reverses_event_id, e.notes
   order by e.occurred_at desc;
end;
$$;

comment on function public.student_payments(uuid) is
  'Receipt history for a student (allocated amounts), keeping reversal rows visible and flagged rather than hiding them (Article III).';

revoke execute on function public.student_financial_summary(uuid) from public, anon;
revoke execute on function public.student_installments(uuid) from public, anon;
revoke execute on function public.student_payments(uuid) from public, anon;

grant execute on function public.student_financial_summary(uuid) to authenticated;
grant execute on function public.student_installments(uuid) to authenticated;
grant execute on function public.student_payments(uuid) to authenticated;

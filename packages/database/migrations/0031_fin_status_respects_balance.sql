-- ============================================================================
-- 0031_fin_status_respects_balance (students section enhancement, follow-up)
--
-- Found while reconciling 0028/0029 against live data: every discount in the
-- system carries `installment_id = NULL` (apply_discount defaults it to NULL),
-- and `installment_running_balance` only subtracts discounts tied to a
-- specific installment. So a student can have a fully-discounted, zero
-- canonical balance while their installments still show past-due remainders.
--
-- Under 0028's original ordering that student was badged 'overdue' despite
-- owing nothing. The canonical whole-ledger balance (`student_balance`, which
-- does count every discount) must win: nothing owed ⇒ 'paid', full stop.
--
-- This changes only the ordering of the fin_status CASE. It does NOT touch
-- installment_running_balance — that is shared with receivables_aging, and
-- changing it would move the aging report's numbers (see the un-allocated
-- discount issue raised separately).
-- MONEY-ADJACENT ⇒ OWNER REVIEW (Article XII).
-- ============================================================================

create or replace function public.student_directory(
  p_school_id        uuid,
  p_q                text    default null,
  p_stage_id         uuid    default null,
  p_grade_id         uuid    default null,
  p_section_id       uuid    default null,
  p_academic_year_id uuid    default null,
  p_status           text    default null,
  p_fin_status       text    default null,
  p_due_within_days  int     default null,
  p_unenrolled       boolean default false,
  p_missing_phone    boolean default false,
  p_sort             text    default 'name'
)
returns table (
  student_id           uuid,
  name                 text,
  guardian_name        text,
  guardian_phone       text,
  status               text,
  grade_id             uuid,
  grade_label          text,
  section_id           uuid,
  section_name         text,
  academic_year_id     uuid,
  total_charged        numeric(14,2),
  total_paid           numeric(14,2),
  total_discount       numeric(14,2),
  total_owed           numeric(14,2),
  overdue_amount       numeric(14,2),
  days_overdue         int,
  next_due_date        date,
  next_due_amount      numeric(14,2),
  installments_total   int,
  installments_settled int,
  fin_status           text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today  date := (now() at time zone 'Africa/Khartoum')::date;
  v_tokens text[];
  v_qdigits text;
begin
  if p_school_id is distinct from public.current_school_id() then
    raise exception 'FORBIDDEN_SCHOOL' using hint = 'لا تملك صلاحية الوصول لبيانات هذه المدرسة.';
  end if;

  v_tokens  := case
                 when public.ar_normalize(p_q) is null then null
                 else regexp_split_to_array(
                        regexp_replace(public.ar_normalize(p_q), '([\\%_])', '\\\1', 'g'),
                        '\s+')
               end;
  v_qdigits := nullif(public.digits_only(p_q), '');

  return query
  with latest_enrollment as (
    select distinct on (en.student_id)
           en.student_id, en.grade_id, en.section_id, en.academic_year_id
      from public.enrollment en
     where en.school_id = p_school_id
       and (p_academic_year_id is null or en.academic_year_id = p_academic_year_id)
     order by en.student_id, en.created_at desc
  ),
  inst as (
    select i.student_id,
           i.due_date,
           i.amount_charged,
           public.installment_running_balance(i.id) as remaining
      from public.installment i
     where i.school_id = p_school_id
  ),
  inst_agg as (
    select x.student_id,
           sum(x.amount_charged)::numeric(14,2)                         as total_charged,
           count(*)::int                                                as installments_total,
           count(*) filter (where x.remaining = 0)::int                 as installments_settled,
           sum(x.remaining) filter (where x.due_date < v_today)::numeric(14,2) as overdue_amount,
           min(x.due_date) filter (where x.remaining > 0 and x.due_date < v_today) as oldest_overdue,
           min(x.due_date) filter (where x.remaining > 0)               as next_due_date
      from inst x
     group by x.student_id
  ),
  pay as (
    select i.student_id, sum(pa.amount)::numeric(14,2) as total_paid
      from public.payment_allocation pa
      join public.installment i on i.id = pa.installment_id
      join public.money_event e on e.id = pa.money_event_id
     where i.school_id = p_school_id
       and e.reverses_event_id is null
       and not exists (select 1 from public.money_event r where r.reverses_event_id = e.id)
     group by i.student_id
  ),
  next_amt as (
    select x.student_id, sum(x.remaining)::numeric(14,2) as next_due_amount
      from inst x
      join inst_agg a on a.student_id = x.student_id
     where x.due_date = a.next_due_date and x.remaining > 0
     group by x.student_id
  ),
  disc as (
    select d.student_id, sum(d.computed_amount)::numeric(14,2) as total_discount
      from public.discount d
     where d.school_id = p_school_id
     group by d.student_id
  ),
  bal as (
    select s.id as student_id, public.student_balance(s.id)::numeric(14,2) as owed
      from public.student s
     where s.school_id = p_school_id
  ),
  rows_out as (
    select s.id                                              as student_id,
           s.name                                            as name,
           s.guardian_name                                   as guardian_name,
           s.guardian_phone                                  as guardian_phone,
           s.status::text                                    as status,
           g.id                                              as grade_id,
           g.label_ar                                        as grade_label,
           sec.id                                            as section_id,
           sec.name                                          as section_name,
           le.academic_year_id                               as academic_year_id,
           coalesce(a.total_charged, 0)::numeric(14,2)       as total_charged,
           coalesce(p.total_paid, 0)::numeric(14,2)          as total_paid,
           coalesce(dc.total_discount, 0)::numeric(14,2)     as total_discount,
           b.owed                                            as total_owed,
           coalesce(a.overdue_amount, 0)::numeric(14,2)      as overdue_amount,
           coalesce((v_today - a.oldest_overdue), 0)::int    as days_overdue,
           a.next_due_date                                   as next_due_date,
           coalesce(na.next_due_amount, 0)::numeric(14,2)    as next_due_amount,
           coalesce(a.installments_total, 0)::int            as installments_total,
           coalesce(a.installments_settled, 0)::int          as installments_settled,
           -- Balance first: a student who owes nothing is never "overdue",
           -- however their individual installment rows read.
           case
             when coalesce(a.installments_total, 0) = 0 then null::text
             when b.owed <= 0                           then 'paid'
             when a.oldest_overdue is not null          then 'overdue'
             when coalesce(p.total_paid, 0) > 0         then 'partial'
             else 'unpaid'
           end                                               as fin_status,
           le.student_id is not null                         as is_enrolled
      from public.student s
      left join latest_enrollment le on le.student_id = s.id
      left join public.grade g       on g.id = le.grade_id
      left join public.section sec   on sec.id = le.section_id
      join bal b                     on b.student_id = s.id
      left join inst_agg a           on a.student_id = s.id
      left join pay p                on p.student_id = s.id
      left join next_amt na          on na.student_id = s.id
      left join disc dc              on dc.student_id = s.id
     where s.school_id = p_school_id
       and (p_status is null   or s.status::text = p_status)
       and (p_stage_id is null or g.stage_id = p_stage_id)
       and (p_grade_id is null or g.id = p_grade_id)
       and (p_section_id is null or sec.id = p_section_id)
       and (not p_missing_phone or public.digits_only(s.guardian_phone) is null
            or public.digits_only(s.guardian_phone) = '')
       and (
         v_tokens is null
         or (
           (select bool_and(
                     public.ar_normalize(s.name || ' ' || coalesce(s.guardian_name, ''))
                       like '%' || tok || '%')
              from unnest(v_tokens) as tok)
           or (v_qdigits is not null
               and length(v_qdigits) >= 3
               and public.digits_only(s.guardian_phone) like '%' || v_qdigits)
         )
       )
  )
  select r.student_id, r.name, r.guardian_name, r.guardian_phone, r.status,
         r.grade_id, r.grade_label, r.section_id, r.section_name, r.academic_year_id,
         r.total_charged, r.total_paid, r.total_discount, r.total_owed,
         r.overdue_amount, r.days_overdue,
         r.next_due_date, r.next_due_amount,
         r.installments_total, r.installments_settled, r.fin_status
    from rows_out r
   where (p_fin_status is null or r.fin_status = p_fin_status)
     and (not p_unenrolled or not r.is_enrolled)
     and (p_due_within_days is null
          or (r.next_due_date is not null
              and r.next_due_date <= v_today + p_due_within_days))
   order by
     case when p_sort = 'owed_desc'      then r.total_owed end desc nulls last,
     case when p_sort = 'oldest_overdue' then r.days_overdue end desc nulls last,
     r.name;
end;
$$;

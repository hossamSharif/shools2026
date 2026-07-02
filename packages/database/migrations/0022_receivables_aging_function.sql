-- ============================================================================
-- receivables_aging (US5, T097)
-- Unpaid students bucketed by days overdue (current / 1-30 / 31-60 / 61-90 /
-- 90+), evaluated "today" in Africa/Khartoum (Article VIII). Filterable by
-- stage/grade/section. Withdrawn/graduated students with an outstanding
-- balance still appear (Edge case) — NOT filtered by student.status.
-- Fully DERIVED (Article II) over installment + payment_allocation + discount.
-- MONEY-ADJACENT (reads money data) ⇒ OWNER REVIEW (Article XII).
-- ============================================================================

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
   order by a.total_owed desc, s.name;
end;
$$;

comment on function public.receivables_aging(uuid, uuid, uuid, uuid) is
  'Derived receivables aging report (current/1-30/31-60/61-90/90+) in Africa/Khartoum, filterable by stage/grade/section. Includes withdrawn/graduated students with a balance.';

grant execute on function public.receivables_aging(uuid, uuid, uuid, uuid) to authenticated;

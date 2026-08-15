-- ============================================================================
-- 0030_guard_student_delete (students section enhancement)
-- `student` cascades to `installment` (0010) and `discount` (0015), so a plain
-- DELETE would silently destroy immutable financial records — a direct Article
-- III violation ("financial rows are never deleted"). 0006 already grants
-- DELETE on public.student to `authenticated`, so that path is reachable today.
--
-- This trigger is the real enforcement: a student who has ANY financial
-- footprint can never be deleted, only archived (status = 'withdrawn').
-- Students created by mistake — with no installments, money events or
-- discounts — remain deletable so the roster can be kept clean.
-- MONEY-ADJACENT ⇒ OWNER REVIEW (Article XII).
-- ============================================================================

create or replace function public.guard_student_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.installment i where i.student_id = old.id)
     or exists (select 1 from public.money_event e where e.student_id = old.id)
     or exists (select 1 from public.discount d where d.student_id = old.id)
     or exists (
          select 1
            from public.payment_allocation pa
            join public.installment i on i.id = pa.installment_id
           where i.student_id = old.id
        )
  then
    raise exception 'STUDENT_HAS_FINANCIAL_HISTORY'
      using hint = 'الطالب لديه سجل مالي — لا يمكن الحذف. استخدم الأرشفة بدلاً من ذلك.';
  end if;
  return old;
end;
$$;

comment on function public.guard_student_delete() is
  'BEFORE DELETE guard on student: blocks deletion of any student carrying installments, money events, payment allocations or discounts (Article III).';

drop trigger if exists student_delete_guard on public.student;
create trigger student_delete_guard
  before delete on public.student
  for each row
  execute function public.guard_student_delete();

revoke execute on function public.guard_student_delete() from public, anon;

-- ============================================================================
-- generate_installments — on enrollment, materialize the student's installments
-- from the matching fee structure's installment schedule (FR-018).
-- MONEY-MIGRATION ⇒ OWNER REVIEW (Article XII).
--
-- No-op when no fee structure matches the (grade, year) (Edge case). Idempotent:
-- skips generation if this enrollment already has installments (avoids double
-- rows on retry). Runs as a trigger AFTER INSERT ON enrollment.
-- ============================================================================

create or replace function public.generate_installments(p_enrollment_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enr        public.enrollment%rowtype;
  v_structure  uuid;
  v_count      int;
begin
  select * into v_enr from public.enrollment where id = p_enrollment_id;
  if not found then
    raise exception 'ENROLLMENT_NOT_FOUND' using errcode = 'P0001';
  end if;

  -- Idempotency: already generated for this enrollment ⇒ no-op.
  select count(*) into v_count
    from public.installment where enrollment_id = p_enrollment_id;
  if v_count > 0 then
    return 0;
  end if;

  -- Matching fee structure for this grade + academic year (Edge: none ⇒ no-op).
  select id into v_structure
    from public.fee_structure
   where school_id = v_enr.school_id
     and grade_id = v_enr.grade_id
     and academic_year_id = v_enr.academic_year_id;

  if v_structure is null then
    return 0;
  end if;

  insert into public.installment
    (school_id, student_id, enrollment_id, sequence, due_date, amount_charged)
  select v_enr.school_id, v_enr.student_id, v_enr.id, s.sequence, s.due_date, s.amount
    from public.installment_schedule s
   where s.fee_structure_id = v_structure
   order by s.sequence;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.generate_installments(uuid) is
  'Materializes a student''s installments from the matching fee structure on enrollment (FR-018); no-op when none.';

grant execute on function public.generate_installments(uuid) to authenticated;

-- Trigger: generate on enrollment insert.
create or replace function public.trg_generate_installments()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.generate_installments(new.id);
  return new;
end;
$$;

drop trigger if exists enrollment_generate_installments on public.enrollment;
create trigger enrollment_generate_installments
  after insert on public.enrollment
  for each row execute function public.trg_generate_installments();

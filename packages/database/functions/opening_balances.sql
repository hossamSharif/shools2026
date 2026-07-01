-- ============================================================================
-- record_opening_balance — mid-year onboarding: carry in a student's existing
-- outstanding charge as a single "carried-in" installment (FR-029).
-- MONEY-MIGRATION ⇒ OWNER REVIEW (Article XII).
--
-- The carried-in charge participates in the derived student/installment balance
-- exactly like a generated installment, so statements and receivables reconcile.
-- Enforces write-gating and same-school scope. Idempotent per (student, seq).
-- ============================================================================

create or replace function public.record_opening_balance(
  p_student_id uuid,
  p_amount     numeric,
  p_due_date   date default (now() at time zone 'Africa/Khartoum')::date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_school_id     uuid;
  v_installment_id uuid;
  v_next_seq      int;
begin
  select school_id into v_school_id from public.student where id = p_student_id;
  if v_school_id is null then
    raise exception 'STUDENT_NOT_FOUND' using errcode = 'P0001';
  end if;

  -- Tenant scope: caller must belong to the student's school.
  if v_school_id <> public.current_school_id() then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  perform public.assert_writes_allowed(v_school_id);

  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_AMOUNT' using errcode = 'P0001';
  end if;

  -- Sequence 0 is reserved for the carried-in opening balance; one per student.
  select id into v_installment_id
    from public.installment
   where student_id = p_student_id and is_carried_in and sequence = 0;
  if v_installment_id is not null then
    return v_installment_id;  -- idempotent
  end if;

  insert into public.installment
    (school_id, student_id, enrollment_id, sequence, due_date, amount_charged, is_carried_in)
  values (v_school_id, p_student_id, null, 0, p_due_date, p_amount, true)
  returning id into v_installment_id;

  return v_installment_id;
end;
$$;

comment on function public.record_opening_balance(uuid, numeric, date) is
  'Carries in a student''s pre-existing outstanding charge as a sequence-0 installment (FR-029); idempotent per student.';

grant execute on function public.record_opening_balance(uuid, numeric, date) to authenticated;

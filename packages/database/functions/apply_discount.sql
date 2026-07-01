-- ============================================================================
-- apply_discount (US4) — non-cash reduction of a student's charge
-- (percentage/fixed/sibling waiver); audited; visible on statement; no cash
-- moves (FR-019/028). OWNER REVIEW (Article XII).
--
-- computed_amount: percentage ⇒ value% of the target installment's charge (or of
-- the student's total charges when untargeted); fixed / sibling_waiver ⇒ value.
-- ============================================================================

create or replace function public.apply_discount(
  p_student_id      uuid,
  p_kind            public.discount_kind,
  p_value           numeric,
  p_idempotency_key uuid,
  p_installment_id  uuid default null,
  p_reason          text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_school_id uuid;
  v_discount_id uuid;
  v_computed  numeric;
  v_base      numeric;
begin
  select school_id into v_school_id from public.student where id = p_student_id;
  if v_school_id is null then
    raise exception 'STUDENT_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_school_id <> public.current_school_id() then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  perform public.assert_writes_allowed(v_school_id);
  if p_value is null or p_value < 0 then
    raise exception 'INVALID_AMOUNT' using errcode = 'P0001';
  end if;
  if p_installment_id is not null
     and not exists (select 1 from public.installment
                      where id = p_installment_id and student_id = p_student_id) then
    raise exception 'INSUFFICIENT_ALLOCATION_TARGET' using errcode = 'P0001';
  end if;

  -- Idempotent replay.
  select id, computed_amount into v_discount_id, v_computed from public.discount
   where school_id = v_school_id and idempotency_key = p_idempotency_key;
  if v_discount_id is not null then
    return jsonb_build_object(
      'discount_id', v_discount_id,
      'computed_amount', v_computed::text,
      'student_balance_after', public.student_balance(p_student_id)::text);
  end if;

  if p_kind = 'percentage' then
    if p_installment_id is not null then
      select amount_charged into v_base from public.installment where id = p_installment_id;
    else
      select coalesce(sum(amount_charged), 0) into v_base
        from public.installment where student_id = p_student_id;
    end if;
    v_computed := round(v_base * p_value / 100, 2);
  else
    v_computed := p_value;   -- fixed / sibling_waiver
  end if;

  insert into public.discount
    (school_id, student_id, installment_id, kind, value, computed_amount,
     reason, actor_user_id, idempotency_key)
  values
    (v_school_id, p_student_id, p_installment_id, p_kind, p_value, v_computed,
     p_reason, auth.uid(), p_idempotency_key)
  returning id into v_discount_id;

  return jsonb_build_object(
    'discount_id', v_discount_id,
    'computed_amount', v_computed::text,
    'student_balance_after', public.student_balance(p_student_id)::text);
end;
$$;

grant execute on function public.apply_discount(uuid, public.discount_kind, numeric, uuid, uuid, text) to authenticated;

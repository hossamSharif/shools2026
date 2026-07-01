-- ============================================================================
-- apply_fee_payment (US3) — the headline money-in function. Single transaction
-- (Article I): oldest-outstanding-first default allocation, blocks overpayment,
-- assigns the next per-school GAPLESS receipt number under row lock, writes the
-- money_event + payment_allocation + audit_entry, enforces write-gating and
-- idempotency. MONEY-MIGRATION ⇒ OWNER REVIEW (Article XII). FR-021/022/023.
-- ============================================================================

create or replace function public.apply_fee_payment(
  p_student_id      uuid,
  p_account_id      uuid,
  p_amount          numeric,
  p_occurred_at     timestamptz,
  p_idempotency_key uuid,
  p_allocations     jsonb default null,   -- [{installment_id, amount}]
  p_attachment_path text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_school_id   uuid;
  v_event_id    uuid;
  v_receipt_no  int;
  v_remaining   numeric;
  v_alloc_total numeric := 0;
  v_rec         record;
  v_running     numeric;
  v_take        numeric;
  v_result      jsonb;
  v_allocs_out  jsonb := '[]'::jsonb;
begin
  -- Resolve tenant from the student; enforce same-school (Article IV).
  select school_id into v_school_id from public.student where id = p_student_id;
  if v_school_id is null then
    raise exception 'STUDENT_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_school_id <> public.current_school_id() then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  -- Account must belong to the same school.
  if not exists (select 1 from public.account where id = p_account_id and school_id = v_school_id) then
    raise exception 'INSUFFICIENT_ALLOCATION_TARGET' using errcode = 'P0001';
  end if;

  perform public.assert_writes_allowed(v_school_id);

  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_AMOUNT' using errcode = 'P0001';
  end if;

  -- Idempotent replay: return the prior result, no double-post.
  select id, receipt_no into v_event_id, v_receipt_no
    from public.money_event
   where school_id = v_school_id and idempotency_key = p_idempotency_key;
  if v_event_id is not null then
    select jsonb_agg(jsonb_build_object(
             'installment_id', pa.installment_id,
             'running_balance_after', public.installment_running_balance(pa.installment_id)::text))
      into v_allocs_out
      from public.payment_allocation pa where pa.money_event_id = v_event_id;
    return jsonb_build_object(
      'money_event_id', v_event_id,
      'receipt_no', v_receipt_no,
      'account_balance_after', public.account_balance(p_account_id)::text,
      'student_balance_after', public.student_balance(p_student_id)::text,
      'allocations', coalesce(v_allocs_out, '[]'::jsonb),
      'idempotent_replay', true);
  end if;

  -- Assign a gapless receipt number under row lock (SC-003).
  insert into public.receipt_counter (school_id) values (v_school_id)
    on conflict (school_id) do nothing;
  select next_value into v_receipt_no
    from public.receipt_counter where school_id = v_school_id for update;
  update public.receipt_counter set next_value = next_value + 1 where school_id = v_school_id;

  -- Post the money event (money in).
  insert into public.money_event
    (school_id, event_type, amount, account_id, actor_user_id, occurred_at,
     idempotency_key, attachment_path, receipt_no)
  values
    (v_school_id, 'fee_payment', p_amount, p_account_id, auth.uid(),
     coalesce(p_occurred_at, now()), p_idempotency_key, p_attachment_path, v_receipt_no)
  returning id into v_event_id;

  v_remaining := p_amount;

  if p_allocations is not null then
    -- Explicit allocation: validate each against its installment running balance.
    for v_rec in
      select (x->>'installment_id')::uuid as installment_id,
             (x->>'amount')::numeric      as amount
        from jsonb_array_elements(p_allocations) x
    loop
      v_running := public.installment_running_balance(v_rec.installment_id);
      if not exists (select 1 from public.installment
                      where id = v_rec.installment_id and student_id = p_student_id) then
        raise exception 'INSUFFICIENT_ALLOCATION_TARGET' using errcode = 'P0001';
      end if;
      if v_rec.amount > v_running then
        raise exception 'OVERPAYMENT_BLOCKED' using errcode = 'P0001';
      end if;
      insert into public.payment_allocation (school_id, money_event_id, installment_id, amount)
      values (v_school_id, v_event_id, v_rec.installment_id, v_rec.amount);
      v_alloc_total := v_alloc_total + v_rec.amount;
    end loop;
    if v_alloc_total <> p_amount then
      raise exception 'INSUFFICIENT_ALLOCATION_TARGET' using errcode = 'P0001';
    end if;
  else
    -- Default: oldest-outstanding-first.
    for v_rec in
      select i.id as installment_id
        from public.installment i
       where i.student_id = p_student_id
       order by i.due_date asc, i.sequence asc
    loop
      exit when v_remaining <= 0;
      v_running := public.installment_running_balance(v_rec.installment_id);
      if v_running <= 0 then continue; end if;
      v_take := least(v_remaining, v_running);
      insert into public.payment_allocation (school_id, money_event_id, installment_id, amount)
      values (v_school_id, v_event_id, v_rec.installment_id, v_take);
      v_remaining := v_remaining - v_take;
    end loop;
    if v_remaining > 0 then
      -- More money than outstanding charges ⇒ would push a balance negative.
      raise exception 'OVERPAYMENT_BLOCKED' using errcode = 'P0001';
    end if;
  end if;

  insert into public.audit_entry (school_id, money_event_id, actor_user_id, action)
  values (v_school_id, v_event_id, auth.uid(), 'apply_fee_payment');

  select jsonb_agg(jsonb_build_object(
           'installment_id', pa.installment_id,
           'running_balance_after', public.installment_running_balance(pa.installment_id)::text))
    into v_allocs_out
    from public.payment_allocation pa where pa.money_event_id = v_event_id;

  v_result := jsonb_build_object(
    'money_event_id', v_event_id,
    'receipt_no', v_receipt_no,
    'account_balance_after', public.account_balance(p_account_id)::text,
    'student_balance_after', public.student_balance(p_student_id)::text,
    'allocations', coalesce(v_allocs_out, '[]'::jsonb),
    'idempotent_replay', false);

  return v_result;
end;
$$;

comment on function public.apply_fee_payment(uuid, uuid, numeric, timestamptz, uuid, jsonb, text) is
  'Records a fee payment: oldest-first allocation, gapless receipt #, blocks overpayment, audited, idempotent (Article I; FR-021/022/023).';

grant execute on function public.apply_fee_payment(uuid, uuid, numeric, timestamptz, uuid, jsonb, text) to authenticated;

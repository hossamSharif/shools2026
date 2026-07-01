-- ============================================================================
-- record_adjustment (US4) — write-off/adjustment changing what a student owes;
-- audited, never a silent edit (FR-027). No cash moves. OWNER REVIEW (Art. XII).
--
-- Convention: p_amount is a positive write-off that REDUCES the student's owed
-- balance (student_balance subtracts adjustment events). Reversal restores it.
-- ============================================================================

create or replace function public.record_adjustment(
  p_student_id      uuid,
  p_amount          numeric,
  p_reason          text,
  p_occurred_at     timestamptz,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_school_id uuid;
  v_event_id  uuid;
begin
  select school_id into v_school_id from public.student where id = p_student_id;
  if v_school_id is null then
    raise exception 'STUDENT_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_school_id <> public.current_school_id() then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  perform public.assert_writes_allowed(v_school_id);
  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_AMOUNT' using errcode = 'P0001';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'INVALID_REASON' using errcode = 'P0001';
  end if;

  select id into v_event_id from public.money_event
   where school_id = v_school_id and idempotency_key = p_idempotency_key;
  if v_event_id is null then
    insert into public.money_event
      (school_id, event_type, amount, student_id, actor_user_id, occurred_at,
       idempotency_key, notes)
    values
      (v_school_id, 'adjustment', p_amount, p_student_id, auth.uid(),
       coalesce(p_occurred_at, now()), p_idempotency_key, p_reason)
    returning id into v_event_id;

    insert into public.audit_entry (school_id, money_event_id, actor_user_id, action)
    values (v_school_id, v_event_id, auth.uid(), 'record_adjustment');
  end if;

  return jsonb_build_object(
    'money_event_id', v_event_id,
    'student_balance_after', public.student_balance(p_student_id)::text);
end;
$$;

grant execute on function public.record_adjustment(uuid, numeric, text, timestamptz, uuid) to authenticated;

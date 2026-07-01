-- ============================================================================
-- reverse_event (US4) — generic reversing entry (Article III). Posts a new
-- money_event referencing the original (reverses_event_id); both remain visible;
-- no UPDATE/DELETE of posted rows (SC-005). OWNER REVIEW (Article XII).
-- ============================================================================

create or replace function public.reverse_event(
  p_money_event_id  uuid,
  p_reason          text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_orig      public.money_event%rowtype;
  v_event_id  uuid;
begin
  select * into v_orig from public.money_event where id = p_money_event_id;
  if not found then
    raise exception 'EVENT_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_orig.school_id <> public.current_school_id() then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if v_orig.reverses_event_id is not null then
    raise exception 'CANNOT_REVERSE_A_REVERSAL' using errcode = 'P0001';
  end if;
  perform public.assert_writes_allowed(v_orig.school_id);
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'INVALID_REASON' using errcode = 'P0001';
  end if;

  -- Idempotent replay.
  select id into v_event_id from public.money_event
   where school_id = v_orig.school_id and idempotency_key = p_idempotency_key;
  if v_event_id is not null then
    return jsonb_build_object('reversing_event_id', v_event_id,
                              'reverses_event_id', p_money_event_id);
  end if;

  -- Already reversed? Refuse a second reversal of the same event.
  if exists (select 1 from public.money_event where reverses_event_id = p_money_event_id) then
    raise exception 'ALREADY_REVERSED' using errcode = 'P0001';
  end if;

  insert into public.money_event
    (school_id, event_type, amount, account_id, from_account_id, to_account_id,
     student_id, actor_user_id, occurred_at, idempotency_key, reverses_event_id, notes)
  values
    (v_orig.school_id, v_orig.event_type, v_orig.amount, v_orig.account_id,
     v_orig.from_account_id, v_orig.to_account_id, v_orig.student_id, auth.uid(),
     now(), p_idempotency_key, p_money_event_id, p_reason)
  returning id into v_event_id;

  insert into public.audit_entry (school_id, money_event_id, actor_user_id, action)
  values (v_orig.school_id, v_event_id, auth.uid(), 'reverse_event');

  return jsonb_build_object('reversing_event_id', v_event_id,
                            'reverses_event_id', p_money_event_id);
end;
$$;

grant execute on function public.reverse_event(uuid, text, uuid) to authenticated;

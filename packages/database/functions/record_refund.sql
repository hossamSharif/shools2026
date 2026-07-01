-- ============================================================================
-- record_refund (US4) — money out to a guardian; adjusts the student ledger;
-- not counted as an expense (FR-026). OWNER REVIEW (Article XII).
-- ============================================================================

create or replace function public.record_refund(
  p_student_id      uuid,
  p_account_id      uuid,
  p_amount          numeric,
  p_occurred_at     timestamptz,
  p_idempotency_key uuid,
  p_description     text default null,
  p_attachment_path text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_school_id uuid;
  v_acc_school uuid;
  v_event_id  uuid;
begin
  select school_id into v_school_id from public.student where id = p_student_id;
  if v_school_id is null then
    raise exception 'STUDENT_NOT_FOUND' using errcode = 'P0001';
  end if;
  select school_id into v_acc_school from public.account where id = p_account_id;
  if v_acc_school is null then
    raise exception 'ACCOUNT_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_school_id <> public.current_school_id() or v_acc_school <> v_school_id then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  perform public.assert_writes_allowed(v_school_id);
  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_AMOUNT' using errcode = 'P0001';
  end if;

  select id into v_event_id from public.money_event
   where school_id = v_school_id and idempotency_key = p_idempotency_key;
  if v_event_id is null then
    insert into public.money_event
      (school_id, event_type, amount, account_id, student_id, actor_user_id,
       occurred_at, idempotency_key, attachment_path, description)
    values
      (v_school_id, 'refund', p_amount, p_account_id, p_student_id, auth.uid(),
       coalesce(p_occurred_at, now()), p_idempotency_key, p_attachment_path, p_description)
    returning id into v_event_id;

    insert into public.audit_entry (school_id, money_event_id, actor_user_id, action)
    values (v_school_id, v_event_id, auth.uid(), 'record_refund');
  end if;

  return jsonb_build_object(
    'money_event_id', v_event_id,
    'account_balance_after', public.account_balance(p_account_id)::text,
    'student_balance_after', public.student_balance(p_student_id)::text);
end;
$$;

grant execute on function public.record_refund(uuid, uuid, numeric, timestamptz, uuid, text, text) to authenticated;

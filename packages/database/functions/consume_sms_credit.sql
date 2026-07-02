-- ============================================================================
-- consume_sms_credit (US7) — atomic SMS credit decrement tied to a sent
-- message. Single transaction (Article I): honors write-gating (dispatch
-- context ⇒ DISPATCH_PAUSED), never lets the derived balance go negative
-- (INSUFFICIENT_CREDIT), never double-charges (idempotency_key ⇒
-- IDEMPOTENT_REPLAY), links the consumption row to sms_message_log.
-- MONEY-MIGRATION ⇒ OWNER REVIEW (Article XII).
-- ============================================================================

create or replace function public.consume_sms_credit(
  p_school_id       uuid,
  p_sms_message_id  uuid,
  p_segments        int,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_consumption_id uuid;
  v_balance        int;
  v_row_school     uuid;
begin
  perform public.assert_writes_allowed(p_school_id, 'dispatch');

  if p_segments is null or p_segments <= 0 then
    raise exception 'INVALID_AMOUNT' using errcode = 'P0001';
  end if;

  select school_id into v_row_school
    from public.sms_message_log where id = p_sms_message_id;
  if v_row_school is null or v_row_school <> p_school_id then
    raise exception 'SMS_MESSAGE_NOT_FOUND' using errcode = 'P0001';
  end if;

  -- Idempotent replay: return the prior consumption, no double-charge.
  select id into v_consumption_id
    from public.sms_credit_consumption
   where school_id = p_school_id and sms_message_id = p_sms_message_id;

  if v_consumption_id is not null then
    select coalesce((select sum(amount) from public.sms_credit_topup where school_id = p_school_id), 0)
         - coalesce((select sum(segments) from public.sms_credit_consumption where school_id = p_school_id), 0)
      into v_balance;
    return jsonb_build_object(
      'consumption_id', v_consumption_id,
      'credit_balance_after', v_balance,
      'idempotent_replay', true);
  end if;

  -- Lock the school's ledger rows to serialize concurrent consumers so the
  -- balance check below cannot race two dispatches into the negative.
  perform 1 from public.sms_credit_topup where school_id = p_school_id for update;

  select coalesce((select sum(amount) from public.sms_credit_topup where school_id = p_school_id), 0)
       - coalesce((select sum(segments) from public.sms_credit_consumption where school_id = p_school_id), 0)
    into v_balance;

  if v_balance < p_segments then
    raise exception 'INSUFFICIENT_CREDIT' using errcode = 'P0001';
  end if;

  insert into public.sms_credit_consumption (school_id, segments, sms_message_id)
  values (p_school_id, p_segments, p_sms_message_id)
  returning id into v_consumption_id;

  select coalesce((select sum(amount) from public.sms_credit_topup where school_id = p_school_id), 0)
       - coalesce((select sum(segments) from public.sms_credit_consumption where school_id = p_school_id), 0)
    into v_balance;

  return jsonb_build_object(
    'consumption_id', v_consumption_id,
    'credit_balance_after', v_balance,
    'idempotent_replay', false);
end;
$$;

comment on function public.consume_sms_credit(uuid, uuid, int, uuid) is
  'Atomic SMS credit decrement for a sent message; never negative, idempotent, DISPATCH_PAUSED-aware (US7).';

grant execute on function public.consume_sms_credit(uuid, uuid, int, uuid) to authenticated;

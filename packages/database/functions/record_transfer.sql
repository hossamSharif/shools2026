-- ============================================================================
-- record_transfer (US4) — neutral inter-account transfer; both balances move,
-- counts as neither income nor expense (FR-025). OWNER REVIEW (Article XII).
-- ============================================================================

create or replace function public.record_transfer(
  p_from_account_id uuid,
  p_to_account_id   uuid,
  p_amount          numeric,
  p_occurred_at     timestamptz,
  p_idempotency_key uuid,
  p_description     text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_school_id   uuid;
  v_to_school   uuid;
  v_event_id    uuid;
begin
  if p_from_account_id = p_to_account_id then
    raise exception 'INVALID_TRANSFER' using errcode = 'P0001';
  end if;

  select school_id into v_school_id from public.account where id = p_from_account_id;
  select school_id into v_to_school from public.account where id = p_to_account_id;
  if v_school_id is null or v_to_school is null then
    raise exception 'ACCOUNT_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_school_id <> public.current_school_id() or v_to_school <> v_school_id then
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
      (school_id, event_type, amount, actor_user_id, occurred_at,
       idempotency_key, from_account_id, to_account_id, description)
    values
      (v_school_id, 'transfer', p_amount, auth.uid(), coalesce(p_occurred_at, now()),
       p_idempotency_key, p_from_account_id, p_to_account_id, p_description)
    returning id into v_event_id;

    insert into public.audit_entry (school_id, money_event_id, actor_user_id, action)
    values (v_school_id, v_event_id, auth.uid(), 'record_transfer');
  end if;

  return jsonb_build_object(
    'money_event_id', v_event_id,
    'from_balance_after', public.account_balance(p_from_account_id)::text,
    'to_balance_after', public.account_balance(p_to_account_id)::text);
end;
$$;

grant execute on function public.record_transfer(uuid, uuid, numeric, timestamptz, uuid, text) to authenticated;

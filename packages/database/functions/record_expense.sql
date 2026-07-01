-- ============================================================================
-- record_expense (US4) — money out from one account with a category (FR-024).
-- Single transaction; audited; write-gated; idempotent. OWNER REVIEW (Art. XII).
-- ============================================================================

create or replace function public.record_expense(
  p_account_id      uuid,
  p_amount          numeric,
  p_category        text,
  p_occurred_at     timestamptz,
  p_idempotency_key uuid,
  p_vendor          text default null,
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
  v_event_id  uuid;
begin
  select school_id into v_school_id from public.account where id = p_account_id;
  if v_school_id is null then
    raise exception 'ACCOUNT_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_school_id <> public.current_school_id() then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  perform public.assert_writes_allowed(v_school_id);
  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_AMOUNT' using errcode = 'P0001';
  end if;
  if p_category is null or length(trim(p_category)) = 0 then
    raise exception 'INVALID_CATEGORY' using errcode = 'P0001';
  end if;

  select id into v_event_id from public.money_event
   where school_id = v_school_id and idempotency_key = p_idempotency_key;
  if v_event_id is null then
    insert into public.money_event
      (school_id, event_type, amount, account_id, actor_user_id, occurred_at,
       idempotency_key, attachment_path, category, vendor, description)
    values
      (v_school_id, 'expense', p_amount, p_account_id, auth.uid(),
       coalesce(p_occurred_at, now()), p_idempotency_key, p_attachment_path,
       p_category, p_vendor, p_description)
    returning id into v_event_id;

    insert into public.audit_entry (school_id, money_event_id, actor_user_id, action)
    values (v_school_id, v_event_id, auth.uid(), 'record_expense');
  end if;

  return jsonb_build_object(
    'money_event_id', v_event_id,
    'account_balance_after', public.account_balance(p_account_id)::text);
end;
$$;

grant execute on function public.record_expense(uuid, numeric, text, timestamptz, uuid, text, text, text) to authenticated;

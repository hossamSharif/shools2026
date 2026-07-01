-- ============================================================================
-- topup_sms_credit — super-admin adds SMS credit to a school (FR-037).
-- MONEY-MIGRATION ⇒ OWNER REVIEW before apply (Article XII).
--
-- Single transaction (Article I): enforces super-admin, honors idempotency,
-- logs actor/when, and returns the derived credit balance (Σtopups−Σconsumptions).
-- ============================================================================

create or replace function public.topup_sms_credit(
  p_school_id       uuid,
  p_amount          int,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_topup_id uuid;
  v_balance  int;
begin
  -- Super-admin only (FR-037).
  if not public.current_is_super_admin() then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_AMOUNT' using errcode = 'P0001';
  end if;

  -- Idempotent replay: return the prior topup's result, no double-post.
  select id into v_topup_id
    from public.sms_credit_topup
   where school_id = p_school_id and idempotency_key = p_idempotency_key;

  if v_topup_id is null then
    insert into public.sms_credit_topup (school_id, amount, actor_user_id, idempotency_key)
    values (p_school_id, p_amount, auth.uid(), p_idempotency_key)
    returning id into v_topup_id;
  end if;

  -- Derived balance (never stored): Σtopups − Σconsumptions.
  select coalesce((select sum(amount) from public.sms_credit_topup where school_id = p_school_id), 0)
       - coalesce((select sum(segments) from public.sms_credit_consumption where school_id = p_school_id), 0)
    into v_balance;

  return jsonb_build_object('topup_id', v_topup_id, 'credit_balance_after', v_balance);
end;
$$;

comment on function public.topup_sms_credit(uuid, int, uuid) is
  'Super-admin SMS credit topup; idempotent; returns derived credit_balance_after.';

grant execute on function public.topup_sms_credit(uuid, int, uuid) to authenticated;

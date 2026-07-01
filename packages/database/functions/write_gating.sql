-- ============================================================================
-- write_gating — subscription lifecycle derivation + write-gating guard.
-- MONEY-MIGRATION ⇒ OWNER REVIEW before apply (Article XII).
--
-- The DB is the authority for write-gating (Article IV). Lifecycle state is
-- DERIVED (never stored) from the subscription's period_end + grace_days,
-- evaluated in Africa/Khartoum (Article VIII). plpgsql defers name resolution
-- to runtime, so this may be created before the subscription table exists.
-- ============================================================================

-- Returns 'active' | 'grace' | 'locked' for a school, evaluated today in
-- Africa/Khartoum. Fail-safe: a school with no subscription row is 'locked'.
create or replace function public.subscription_state(p_school_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_period_end date;
  v_grace_days int;
  v_today      date;
begin
  select s.period_end, s.grace_days
    into v_period_end, v_grace_days
    from public.subscription s
   where s.school_id = p_school_id
   order by s.period_end desc
   limit 1;

  if v_period_end is null then
    return 'locked';
  end if;

  -- "Today" in the school timezone (Article VIII).
  v_today := (now() at time zone 'Africa/Khartoum')::date;

  if v_today <= v_period_end then
    return 'active';
  elsif v_today <= (v_period_end + make_interval(days => v_grace_days))::date then
    return 'grace';
  else
    return 'locked';
  end if;
end;
$$;

-- Guard called at the top of every money/credit-mutating function. Raises
-- WRITES_GATED (money writes) or DISPATCH_PAUSED (SMS dispatch) when the school
-- is not in the 'active' state. The message string IS the error code the RPC
-- layer maps (Article I contract).
create or replace function public.assert_writes_allowed(
  p_school_id uuid,
  p_context   text default 'write'   -- 'write' | 'dispatch'
)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_state text;
begin
  v_state := public.subscription_state(p_school_id);
  if v_state <> 'active' then
    if p_context = 'dispatch' then
      raise exception 'DISPATCH_PAUSED' using errcode = 'P0001';
    else
      raise exception 'WRITES_GATED' using errcode = 'P0001';
    end if;
  end if;
end;
$$;

comment on function public.subscription_state(uuid) is
  'Derived subscription lifecycle (active|grace|locked) in Africa/Khartoum.';
comment on function public.assert_writes_allowed(uuid, text) is
  'Write-gating guard: raises WRITES_GATED/DISPATCH_PAUSED outside active state.';

grant execute on function public.subscription_state(uuid) to authenticated;
grant execute on function public.assert_writes_allowed(uuid, text) to authenticated;

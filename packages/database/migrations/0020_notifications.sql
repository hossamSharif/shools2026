-- ============================================================================
-- 0020_notifications (US9) — in-app notification center.
-- Non-financial table: no money data is stored here (payload is a summary for
-- display only), so it is NOT subject to the Article IV financial-table rule.
-- Users see only their own school's notifications, addressed to themselves;
-- they may mark their own notifications read (read_at) but never insert
-- directly — all inserts go through public.emit_notification (SECURITY DEFINER,
-- called by money/lifecycle functions).
-- ============================================================================

create type public.notification_type as enum (
  'payment_recorded',
  'low_sms_credit',
  'subscription_expiring'
);

create table public.notification (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references public.school (id) on delete cascade,
  user_id    uuid not null references public.user (id) on delete cascade,
  type       public.notification_type not null,
  payload    jsonb not null default '{}'::jsonb,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

create index notification_user_unread_idx
  on public.notification (school_id, user_id, created_at desc)
  where read_at is null;
create index notification_user_idx
  on public.notification (school_id, user_id, created_at desc);

-- ── RLS: same-school + own-user read; own-user mark-read; no direct insert ──
alter table public.notification enable row level security;
alter table public.notification force row level security;

create policy "notification_own_read"
  on public.notification for select to authenticated
  using (school_id = public.current_school_id() and user_id = auth.uid());

create policy "notification_own_mark_read"
  on public.notification for update to authenticated
  using (school_id = public.current_school_id() and user_id = auth.uid())
  with check (school_id = public.current_school_id() and user_id = auth.uid());

grant select, update on public.notification to authenticated;

-- ============================================================================
-- emit_notification — internal helper (SECURITY DEFINER) used by money/lifecycle
-- functions to insert a notification row. Not part of the public RPC surface:
-- EXECUTE is revoked from authenticated/anon/public below; only other
-- SECURITY DEFINER functions (which run as the function owner) can call it.
-- ============================================================================

create or replace function public.emit_notification(
  p_school_id uuid,
  p_user_id   uuid,
  p_type      public.notification_type,
  p_payload   jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.notification (school_id, user_id, type, payload)
  values (p_school_id, p_user_id, p_type, coalesce(p_payload, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;

comment on function public.emit_notification(uuid, uuid, public.notification_type, jsonb) is
  'Internal insert helper for notifications; called only from other SECURITY DEFINER functions, not directly by clients.';

revoke execute on function public.emit_notification(uuid, uuid, public.notification_type, jsonb) from public, anon, authenticated;

-- ============================================================================
-- mark_notification_read — client-facing RPC (simple wrapper honoring RLS via
-- direct UPDATE would also work, but a function gives a stable API + allows
-- "mark all read" in one round trip).
-- ============================================================================

create or replace function public.mark_notification_read(p_notification_id uuid default null)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_notification_id is null then
    update public.notification
       set read_at = now()
     where user_id = auth.uid()
       and school_id = public.current_school_id()
       and read_at is null;
  else
    update public.notification
       set read_at = now()
     where id = p_notification_id
       and user_id = auth.uid()
       and school_id = public.current_school_id();
  end if;
end;
$$;

comment on function public.mark_notification_read(uuid) is
  'Marks one notification (or all of the caller''s unread notifications when null) as read.';

grant execute on function public.mark_notification_read(uuid) to authenticated;

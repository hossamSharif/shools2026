-- ============================================================================
-- 0002_school_subscription
-- The tenant root (school) and its subscription window. Touches RLS + drives
-- write-gating ⇒ MONEY-ADJACENT: OWNER REVIEW before apply (Article XII).
-- ============================================================================

-- Tenant root (the isolation boundary). No school_id column — it IS the school.
create table public.school (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

-- Annual subscription window. Lifecycle state is DERIVED (subscription_state),
-- never stored (Article II). grace_days defaults to 14.
create table public.subscription (
  id           uuid primary key default gen_random_uuid(),
  school_id    uuid not null references public.school (id) on delete cascade,
  period_start date not null,
  period_end   date not null,
  grace_days   int  not null default 14 check (grace_days >= 0),
  created_at   timestamptz not null default now(),
  constraint subscription_period_order check (period_end >= period_start)
);

create index subscription_school_id_idx on public.subscription (school_id);

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.school enable row level security;
alter table public.school force row level security;
alter table public.subscription enable row level security;
alter table public.subscription force row level security;

-- Super-admin operates the tenant directory + subscriptions (FR-002/003).
create policy "school_superadmin_all"
  on public.school for all to authenticated
  using (public.current_role() = 'super_admin')
  with check (public.current_role() = 'super_admin');

create policy "subscription_superadmin_all"
  on public.subscription for all to authenticated
  using (public.current_role() = 'super_admin')
  with check (public.current_role() = 'super_admin');

-- Tenant users may READ their own school + subscription (for the countdown
-- banner and lifecycle gating). They never write these.
create policy "school_tenant_read"
  on public.school for select to authenticated
  using (id = public.current_school_id());

create policy "subscription_tenant_read"
  on public.subscription for select to authenticated
  using (school_id = public.current_school_id());

grant select, insert, update, delete on public.school to authenticated;
grant select, insert, update, delete on public.subscription to authenticated;

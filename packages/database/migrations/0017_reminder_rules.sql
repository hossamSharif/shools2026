-- ============================================================================
-- 0017_reminder_rules
-- Per-school SMS reminder rule configuration (US7, FR-038/039). Tenant-owned
-- configuration table (not financial) — standard tenant RLS + GRANTs.
-- ============================================================================

create table public.reminder_rule (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.school (id) on delete cascade,
  offset_kind text not null check (offset_kind in ('before', 'on', 'after')),
  days        int  not null default 0 check (days >= 0),
  enabled     boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint reminder_rule_on_zero_days check (offset_kind <> 'on' or days = 0)
);

create index reminder_rule_school_idx on public.reminder_rule (school_id);

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.reminder_rule enable row level security;
alter table public.reminder_rule force row level security;

create policy "reminder_rule_tenant_rw"
  on public.reminder_rule
  for all
  to authenticated
  using (school_id = public.current_school_id())
  with check (school_id = public.current_school_id());

grant select, insert, update, delete on public.reminder_rule to authenticated;

-- Seed default rules (3 days before, on due date, 3 days after) for every
-- existing school; new schools should get these seeded at onboarding time.
insert into public.reminder_rule (school_id, offset_kind, days, enabled)
select s.id, r.offset_kind, r.days, true
  from public.school s
  cross join (
    values ('before', 3), ('on', 0), ('after', 3)
  ) as r(offset_kind, days)
on conflict do nothing;

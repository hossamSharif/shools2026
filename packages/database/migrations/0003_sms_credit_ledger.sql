-- ============================================================================
-- 0003_sms_credit_ledger
-- SMS credit as an append-only ledger; balance = Σtopups − Σconsumptions
-- (Article II, never stored). MONEY-MIGRATION ⇒ OWNER REVIEW (Article XII).
-- ============================================================================

-- Credit added by the super-admin (FR-037). The super-admin CAN read/write this
-- (it is operator billing, not a school financial record).
create table public.sms_credit_topup (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references public.school (id) on delete cascade,
  amount        int  not null check (amount > 0),   -- credits (segments)
  actor_user_id uuid not null references public.user (id),
  idempotency_key uuid not null,
  created_at    timestamptz not null default now(),
  constraint sms_credit_topup_idem unique (school_id, idempotency_key)
);

-- Credit consumed by dispatch (FR-039/040). This is a school FINANCIAL record —
-- super-admin is excluded (see 0004). sms_message_id is nullable until the SMS
-- log exists (Phase 9); the consume function links it.
create table public.sms_credit_consumption (
  id             uuid primary key default gen_random_uuid(),
  school_id      uuid not null references public.school (id) on delete cascade,
  segments       int  not null check (segments > 0),
  sms_message_id uuid,
  created_at     timestamptz not null default now()
);

create index sms_credit_topup_school_idx on public.sms_credit_topup (school_id);
create index sms_credit_consumption_school_idx on public.sms_credit_consumption (school_id);

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.sms_credit_topup enable row level security;
alter table public.sms_credit_topup force row level security;
alter table public.sms_credit_consumption enable row level security;
alter table public.sms_credit_consumption force row level security;

-- Topups: super-admin manages; tenant reads own (to derive balance).
create policy "sms_topup_superadmin_all"
  on public.sms_credit_topup for all to authenticated
  using (public.current_role() = 'super_admin')
  with check (public.current_role() = 'super_admin');

create policy "sms_topup_tenant_read"
  on public.sms_credit_topup for select to authenticated
  using (school_id = public.current_school_id());

-- Consumption: tenant reads own only. Writes happen through the SECURITY
-- DEFINER consume_sms_credit function; no direct tenant insert policy.
create policy "sms_consumption_tenant_read"
  on public.sms_credit_consumption for select to authenticated
  using (school_id = public.current_school_id());

-- Append-only: no update/delete. Topup insert allowed to authenticated (RLS +
-- the topup function enforce super-admin); consumption inserts via function only.
grant select, insert on public.sms_credit_topup to authenticated;
grant select on public.sms_credit_consumption to authenticated;

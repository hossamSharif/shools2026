-- ============================================================================
-- 0008_accounts (US2)
-- Cash/bank accounts with an opening balance. Live balance is DERIVED
-- (opening_balance + Σ events) — never stored editable (Article II; FR-012/014).
-- MONEY-ADJACENT ⇒ OWNER REVIEW (Article XII).
-- ============================================================================

create type public.account_type as enum ('cash', 'bank');

create table public.account (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references public.school (id) on delete cascade,
  name            text not null,
  type            public.account_type not null,
  account_number  text,                             -- nullable (bank only)
  opening_balance numeric(14,2) not null default 0,
  created_at      timestamptz not null default now()
);

create index account_school_idx on public.account (school_id);

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.account enable row level security;
alter table public.account force row level security;

create policy "account_tenant_rw"
  on public.account for all to authenticated
  using (school_id = public.current_school_id())
  with check (school_id = public.current_school_id());

grant select, insert, update, delete on public.account to authenticated;

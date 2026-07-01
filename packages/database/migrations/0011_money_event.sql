-- ============================================================================
-- 0011_money_event (US3)
-- The canonical append-only typed money ledger (Article III). One family with a
-- typed discriminator; posted rows IMMUTABLE and NEVER deleted; corrections are
-- reversing entries (reverses_event_id). Balances DERIVED (Article II).
-- MONEY-MIGRATION ⇒ OWNER REVIEW (Article XII).
--
-- Financial-table rule (Article IV): same-school SELECT only, no super-admin
-- policy; all writes via SECURITY DEFINER money functions.
-- ============================================================================

create type public.money_event_type as enum (
  'fee_payment', 'expense', 'transfer', 'refund', 'adjustment'
);

create table public.money_event (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references public.school (id) on delete cascade,
  event_type        public.money_event_type not null,
  amount            numeric(14,2) not null check (amount >= 0),
  account_id        uuid references public.account (id),
  actor_user_id     uuid not null references public.user (id),
  occurred_at       timestamptz not null default now(),
  idempotency_key   uuid not null,
  reverses_event_id uuid references public.money_event (id),
  attachment_path   text,
  notes             text,
  -- fee_payment: per-school gapless receipt number (assigned in-txn).
  receipt_no        int,
  -- expense fields.
  category          text,
  vendor            text,
  description       text,
  created_at        timestamptz not null default now(),
  constraint money_event_idem_unique unique (school_id, idempotency_key)
);

-- Per-school gapless receipt number is unique when present (fee_payment only).
create unique index money_event_receipt_no_unique
  on public.money_event (school_id, receipt_no)
  where receipt_no is not null;

create index money_event_account_idx
  on public.money_event (school_id, account_id, occurred_at);
create index money_event_type_idx
  on public.money_event (school_id, event_type, occurred_at);

-- ── RLS (financial: same-school READ only; no super-admin; no update/delete) ──
alter table public.money_event enable row level security;
alter table public.money_event force row level security;

create policy "money_event_tenant_read"
  on public.money_event for select to authenticated
  using (school_id = public.current_school_id());

grant select on public.money_event to authenticated;

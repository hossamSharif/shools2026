-- ============================================================================
-- 0013_payment_allocation (US3)
-- Links a fee_payment (money_event) to the installment(s) it pays, with the
-- allocated amount. Drives the installment running balance (Article II).
-- Also carries discount/refund allocations (kept generic via money_event_id).
-- MONEY-MIGRATION ⇒ OWNER REVIEW (Article XII).
-- ============================================================================

create table public.payment_allocation (
  id             uuid primary key default gen_random_uuid(),
  school_id      uuid not null references public.school (id) on delete cascade,
  money_event_id uuid not null references public.money_event (id),
  installment_id uuid not null references public.installment (id),
  amount         numeric(14,2) not null check (amount >= 0),
  created_at     timestamptz not null default now()
);

create index payment_allocation_event_idx on public.payment_allocation (money_event_id);
create index payment_allocation_installment_idx
  on public.payment_allocation (school_id, installment_id);

-- ── RLS (financial: same-school READ only; no super-admin) ───────────────────
alter table public.payment_allocation enable row level security;
alter table public.payment_allocation force row level security;

create policy "payment_allocation_tenant_read"
  on public.payment_allocation for select to authenticated
  using (school_id = public.current_school_id());

grant select on public.payment_allocation to authenticated;

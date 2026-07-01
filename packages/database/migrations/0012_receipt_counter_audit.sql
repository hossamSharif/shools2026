-- ============================================================================
-- 0012_receipt_counter_audit (US3)
-- Per-school gapless receipt counter (locked FOR UPDATE inside apply_fee_payment)
-- and the immutable audit trail written inside every money function (Article V).
-- MONEY-MIGRATION ⇒ OWNER REVIEW (Article XII).
-- ============================================================================

-- One counter row per school; next_value is the next receipt number to assign.
create table public.receipt_counter (
  school_id  uuid primary key references public.school (id) on delete cascade,
  next_value int not null default 1 check (next_value >= 1)
);

create table public.audit_entry (
  id             uuid primary key default gen_random_uuid(),
  school_id      uuid not null references public.school (id) on delete cascade,
  money_event_id uuid references public.money_event (id),
  actor_user_id  uuid not null references public.user (id),
  action         text not null,
  created_at     timestamptz not null default now()
);

create index audit_entry_school_idx on public.audit_entry (school_id, created_at);
create index audit_entry_event_idx on public.audit_entry (money_event_id);

-- ── RLS (financial: same-school READ only; no super-admin) ───────────────────
alter table public.receipt_counter enable row level security;
alter table public.receipt_counter force row level security;
alter table public.audit_entry enable row level security;
alter table public.audit_entry force row level security;

create policy "receipt_counter_tenant_read"
  on public.receipt_counter for select to authenticated
  using (school_id = public.current_school_id());

create policy "audit_entry_tenant_read"
  on public.audit_entry for select to authenticated
  using (school_id = public.current_school_id());

grant select on public.receipt_counter to authenticated;
grant select on public.audit_entry to authenticated;

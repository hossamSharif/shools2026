-- ============================================================================
-- 0010_installments (US2)
-- Student-specific installment (invoice) rows — IMMUTABLE financial records
-- (Article III). Generated from the fee structure on enrollment (FR-018).
-- Running balance is DERIVED (Article II). MONEY-MIGRATION ⇒ OWNER REVIEW.
--
-- Financial-table rule (Article IV): default-deny RLS, same-school SELECT only,
-- NO super-admin policy; inserts happen via the SECURITY DEFINER
-- generate_installments()/opening-balance functions, never direct client writes.
-- ============================================================================

create table public.installment (
  id             uuid primary key default gen_random_uuid(),
  school_id      uuid not null references public.school (id) on delete cascade,
  student_id     uuid not null references public.student (id) on delete cascade,
  enrollment_id  uuid references public.enrollment (id) on delete cascade,
  sequence       int  not null,
  due_date       date not null,
  amount_charged numeric(14,2) not null check (amount_charged >= 0),
  is_carried_in  boolean not null default false,     -- mid-year opening balance (FR-029)
  created_at     timestamptz not null default now()
);

create index installment_student_idx on public.installment (school_id, student_id);
create index installment_due_idx on public.installment (school_id, due_date);
create index installment_enrollment_idx on public.installment (enrollment_id);

-- ── RLS (financial: same-school READ only; no super-admin; no update/delete) ──
alter table public.installment enable row level security;
alter table public.installment force row level security;

create policy "installment_tenant_read"
  on public.installment for select to authenticated
  using (school_id = public.current_school_id());

-- Append-only: SELECT + INSERT only. Writes flow through SECURITY DEFINER
-- functions; the insert grant is a coarse gate, RLS still filters by school.
grant select, insert on public.installment to authenticated;

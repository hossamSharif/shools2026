-- ============================================================================
-- 0009_fee_structure (US2)
-- Per-grade per-year fee structure with fee items and an installment schedule.
-- Template only (student installments are generated on enrollment — 0010).
-- MONEY-ADJACENT ⇒ OWNER REVIEW (Article XII). FR-016/017.
-- ============================================================================

create table public.fee_structure (
  id               uuid primary key default gen_random_uuid(),
  school_id        uuid not null references public.school (id) on delete cascade,
  grade_id         uuid not null references public.grade (id),
  academic_year_id uuid not null references public.academic_year (id),
  created_at       timestamptz not null default now(),
  constraint fee_structure_unique unique (school_id, grade_id, academic_year_id)
);

create index fee_structure_school_idx on public.fee_structure (school_id);
create index fee_structure_lookup_idx
  on public.fee_structure (school_id, grade_id, academic_year_id);

-- Named fee components (tuition/transport/books/exam/uniform…).
create table public.fee_item (
  id               uuid primary key default gen_random_uuid(),
  school_id        uuid not null references public.school (id) on delete cascade,
  fee_structure_id uuid not null references public.fee_structure (id) on delete cascade,
  name             text not null,
  amount           numeric(14,2) not null check (amount >= 0)
);

create index fee_item_structure_idx on public.fee_item (fee_structure_id);

-- Flexible installment schedule; each entry has its own due date + amount.
create table public.installment_schedule (
  id               uuid primary key default gen_random_uuid(),
  school_id        uuid not null references public.school (id) on delete cascade,
  fee_structure_id uuid not null references public.fee_structure (id) on delete cascade,
  sequence         int  not null check (sequence > 0),
  due_date         date not null,
  amount           numeric(14,2) not null check (amount >= 0),
  constraint installment_schedule_seq_unique unique (fee_structure_id, sequence)
);

create index installment_schedule_structure_idx
  on public.installment_schedule (fee_structure_id);

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.fee_structure enable row level security;
alter table public.fee_structure force row level security;
alter table public.fee_item enable row level security;
alter table public.fee_item force row level security;
alter table public.installment_schedule enable row level security;
alter table public.installment_schedule force row level security;

create policy "fee_structure_tenant_rw"
  on public.fee_structure for all to authenticated
  using (school_id = public.current_school_id())
  with check (school_id = public.current_school_id());

create policy "fee_item_tenant_rw"
  on public.fee_item for all to authenticated
  using (school_id = public.current_school_id())
  with check (school_id = public.current_school_id());

create policy "installment_schedule_tenant_rw"
  on public.installment_schedule for all to authenticated
  using (school_id = public.current_school_id())
  with check (school_id = public.current_school_id());

grant select, insert, update, delete on public.fee_structure to authenticated;
grant select, insert, update, delete on public.fee_item to authenticated;
grant select, insert, update, delete on public.installment_schedule to authenticated;

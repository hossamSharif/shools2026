-- ============================================================================
-- 0015_discounts (US4)
-- Non-cash reductions (percentage/fixed/sibling waiver). Immutable, attributable,
-- visible on the statement (FR-019/028). Posted via apply_discount.
-- MONEY-MIGRATION ⇒ OWNER REVIEW (Article XII).
-- ============================================================================

create type public.discount_kind as enum ('percentage', 'fixed', 'sibling_waiver');

create table public.discount (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references public.school (id) on delete cascade,
  student_id      uuid not null references public.student (id) on delete cascade,
  installment_id  uuid references public.installment (id),
  kind            public.discount_kind not null,
  value           numeric(14,2) not null check (value >= 0),
  computed_amount numeric(14,2) not null check (computed_amount >= 0),
  reason          text,
  actor_user_id   uuid not null references public.user (id),
  idempotency_key uuid not null,
  created_at      timestamptz not null default now(),
  constraint discount_idem_unique unique (school_id, idempotency_key)
);

create index discount_student_idx on public.discount (school_id, student_id);

-- ── RLS (financial: same-school READ only; no super-admin) ───────────────────
alter table public.discount enable row level security;
alter table public.discount force row level security;

create policy "discount_tenant_read"
  on public.discount for select to authenticated
  using (school_id = public.current_school_id());

grant select on public.discount to authenticated;

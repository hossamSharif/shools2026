-- ============================================================================
-- 0005_academic_year (US2)
-- Academic years per school with EXACTLY ONE current (partial unique index).
-- Tenant-scoped (Article IV): school_id + default-deny RLS + GRANTs.
-- Not a money table, but drives fee structures/enrollment. FR-007.
-- ============================================================================

create table public.academic_year (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references public.school (id) on delete cascade,
  label      text not null,                       -- e.g. 2025/2026
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  constraint academic_year_label_unique unique (school_id, label)
);

create index academic_year_school_idx on public.academic_year (school_id);

-- Exactly one current year per school (Edge "Current academic year switch").
create unique index academic_year_one_current
  on public.academic_year (school_id)
  where is_current;

-- ── RLS (default-deny, same-school rw) ──────────────────────────────────────
alter table public.academic_year enable row level security;
alter table public.academic_year force row level security;

create policy "academic_year_tenant_rw"
  on public.academic_year for all to authenticated
  using (school_id = public.current_school_id())
  with check (school_id = public.current_school_id());

grant select, insert, update, delete on public.academic_year to authenticated;

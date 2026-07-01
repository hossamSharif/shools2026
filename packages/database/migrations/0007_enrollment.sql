-- ============================================================================
-- 0007_enrollment (US2)
-- Ties a student to a grade+section for an academic year; supports moving
-- through grades across years. Tenant-scoped (Article IV). FR-011.
-- On insert, generate_installments() (0010/T051) creates the student's
-- installments from the matching fee structure (FR-018).
-- ============================================================================

create table public.enrollment (
  id               uuid primary key default gen_random_uuid(),
  school_id        uuid not null references public.school (id) on delete cascade,
  student_id       uuid not null references public.student (id) on delete cascade,
  grade_id         uuid not null references public.grade (id),
  section_id       uuid not null references public.section (id),
  academic_year_id uuid not null references public.academic_year (id),
  created_at       timestamptz not null default now(),
  constraint enrollment_unique_per_year unique (school_id, student_id, academic_year_id)
);

create index enrollment_school_idx on public.enrollment (school_id);
create index enrollment_student_idx on public.enrollment (school_id, student_id);
create index enrollment_year_idx on public.enrollment (school_id, academic_year_id);

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.enrollment enable row level security;
alter table public.enrollment force row level security;

create policy "enrollment_tenant_rw"
  on public.enrollment for all to authenticated
  using (school_id = public.current_school_id())
  with check (school_id = public.current_school_id());

grant select, insert, update, delete on public.enrollment to authenticated;

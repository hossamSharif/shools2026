-- ============================================================================
-- 0006_sections_students (US2)
-- Sections (شعبة) under fixed grades, and students. Tenant-scoped (Article IV).
-- No money effect (FR-009/010).
-- ============================================================================

create table public.section (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references public.school (id) on delete cascade,
  grade_id   uuid not null references public.grade (id),
  name       text not null,
  created_at timestamptz not null default now(),
  constraint section_name_unique unique (school_id, grade_id, name)
);

create index section_school_idx on public.section (school_id);
create index section_grade_idx on public.section (school_id, grade_id);

create type public.student_status as enum ('active', 'withdrawn', 'graduated');

create table public.student (
  id             uuid primary key default gen_random_uuid(),
  school_id      uuid not null references public.school (id) on delete cascade,
  name           text not null,
  guardian_name  text,
  guardian_phone text,                              -- nullable; validated at boundary
  photo_path     text,                              -- nullable Storage key
  status         public.student_status not null default 'active',
  created_at     timestamptz not null default now()
);

create index student_school_idx on public.student (school_id);

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.section enable row level security;
alter table public.section force row level security;
alter table public.student enable row level security;
alter table public.student force row level security;

create policy "section_tenant_rw"
  on public.section for all to authenticated
  using (school_id = public.current_school_id())
  with check (school_id = public.current_school_id());

create policy "student_tenant_rw"
  on public.student for all to authenticated
  using (school_id = public.current_school_id())
  with check (school_id = public.current_school_id());

grant select, insert, update, delete on public.section to authenticated;
grant select, insert, update, delete on public.student to authenticated;

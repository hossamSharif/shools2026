-- ============================================================================
-- stages_grades — fixed reference data (Article: reference, not tenant-scoped).
-- Three stages and twelve grades with Arabic labels (Primary 6 / Middle 3 /
-- Secondary 3). Readable by all authenticated users; never school-scoped.
-- Idempotent: safe to re-run (upsert on stable `code`).
-- ============================================================================

create table if not exists public.stage (
  id        uuid primary key default gen_random_uuid(),
  code      text not null unique,           -- stable natural key
  label_ar  text not null,
  ordinal   int  not null unique
);

create table if not exists public.grade (
  id        uuid primary key default gen_random_uuid(),
  code      text not null unique,           -- stable natural key
  stage_id  uuid not null references public.stage (id),
  label_ar  text not null,
  ordinal   int  not null unique            -- 1..12 across all stages
);

-- Reference data is world-readable to authenticated users (no tenant scope).
alter table public.stage enable row level security;
alter table public.grade enable row level security;
create policy "stage_read_all" on public.stage for select to authenticated using (true);
create policy "grade_read_all" on public.grade for select to authenticated using (true);
grant select on public.stage to authenticated;
grant select on public.grade to authenticated;

-- ── Seed stages ─────────────────────────────────────────────────────────────
insert into public.stage (code, label_ar, ordinal) values
  ('primary',   'الابتدائية', 1),
  ('middle',    'المتوسطة',   2),
  ('secondary', 'الثانوية',   3)
on conflict (code) do update set label_ar = excluded.label_ar, ordinal = excluded.ordinal;

-- ── Seed grades (ordinal is global 1..12) ───────────────────────────────────
insert into public.grade (code, stage_id, label_ar, ordinal)
select v.code, s.id, v.label_ar, v.ordinal
from (values
  ('p1', 'primary',   'الأول الابتدائي',   1),
  ('p2', 'primary',   'الثاني الابتدائي',  2),
  ('p3', 'primary',   'الثالث الابتدائي',  3),
  ('p4', 'primary',   'الرابع الابتدائي',  4),
  ('p5', 'primary',   'الخامس الابتدائي',  5),
  ('p6', 'primary',   'السادس الابتدائي',  6),
  ('m1', 'middle',    'الأول المتوسط',     7),
  ('m2', 'middle',    'الثاني المتوسط',    8),
  ('m3', 'middle',    'الثالث المتوسط',    9),
  ('s1', 'secondary', 'الأول الثانوي',    10),
  ('s2', 'secondary', 'الثاني الثانوي',   11),
  ('s3', 'secondary', 'الثالث الثانوي',   12)
) as v(code, stage_code, label_ar, ordinal)
join public.stage s on s.code = v.stage_code
on conflict (code) do update
  set stage_id = excluded.stage_id,
      label_ar = excluded.label_ar,
      ordinal  = excluded.ordinal;

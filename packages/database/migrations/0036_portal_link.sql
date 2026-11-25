-- ============================================================================
-- 0036_portal_link (spec 002, data-model §6, research R6).
-- Minimal guardian/student ↔ student link, completed by feature 08. In this
-- feature only service-role test fixtures create links (FR-017): there is no
-- write grant to authenticated. Guardian contact stays on
-- student.guardian_name/phone and is not duplicated here.
-- TOUCHES RLS ⇒ OWNER REVIEW before apply (Article XII).
-- ============================================================================

create table public.portal_link (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references public.school (id) on delete cascade,
  user_id    uuid not null references public.user (id) on delete cascade,
  student_id uuid not null references public.student (id) on delete cascade,
  kind       public.portal_link_kind not null,
  created_at timestamptz not null default now(),
  constraint portal_link_user_student_unique unique (user_id, student_id)
);

-- A student account is linked to exactly one student (itself).
create unique index portal_link_one_self_per_user
  on public.portal_link (user_id) where kind = 'self';
create index portal_link_user_idx on public.portal_link (user_id);
create index portal_link_student_idx on public.portal_link (student_id);

comment on table public.portal_link is
  'Guardian (siblings allowed) or self link between a portal user and a student (FR-014/017).';

-- The student and the user must both belong to the link's school.
create or replace function public.trg_portal_link_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.student s
                  where s.id = new.student_id and s.school_id = new.school_id)
     or not exists (select 1 from public.user u
                     where u.id = new.user_id and u.school_id = new.school_id) then
    raise exception 'FORBIDDEN_SCHOOL' using
      errcode = 'P0001',
      hint = 'لا تملك صلاحية الوصول لبيانات هذه المدرسة.';
  end if;
  return new;
end;
$$;

revoke execute on function public.trg_portal_link_guard() from public, anon, authenticated;

create trigger portal_link_guard
  before insert or update on public.portal_link
  for each row execute function public.trg_portal_link_guard();

-- ── RLS (Article IV checklist) ──────────────────────────────────────────────
alter table public.portal_link enable row level security;
alter table public.portal_link force row level security;

create policy "portal_link_own_select"
  on public.portal_link for select to authenticated
  using (user_id = (select auth.uid()));
-- users.read policy added in 0037 (needs has_perm).

revoke all on table public.portal_link from anon, authenticated;
grant select on table public.portal_link to authenticated;

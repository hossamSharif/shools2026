-- ============================================================================
-- 0035_permission_catalogue (spec 002, data-model §5, research R3/R7/R15).
-- Product-fixed permission catalogue: keys, role defaults (access-matrix §1 D
-- cells and §2 defaults), the FR-010 optional switches, and per-school switch
-- settings. The never-grantable set (FR-011) is structural: a school switch has
-- a composite FK to optional_permission, so a forbidden grant cannot be stored.
-- TOUCHES RLS ⇒ OWNER REVIEW before apply (Article XII).
--
-- The seed below is generated from packages/shared/src/access/keys.ts; the
-- catalogue test (src/access/catalogue.test.ts) asserts they stay equal.
-- Changes happen only through new migrations.
-- ============================================================================

-- ── 1. Tables ───────────────────────────────────────────────────────────────
create table public.permission (
  key            text primary key,
  module         text not null,
  action         text not null,
  stage_scopable boolean not null default false,
  enforced       boolean not null default true,
  label_ar       text not null
);

create table public.role_permission_default (
  role           public.user_role not null,
  permission_key text not null references public.permission (key),
  primary key (role, permission_key)
);

create table public.optional_permission (
  role            public.user_role not null,
  permission_key  text not null references public.permission (key),
  default_enabled boolean not null,
  label_ar        text not null,
  primary key (role, permission_key)
);

create table public.school_role_permission (
  school_id      uuid not null references public.school (id) on delete cascade,
  role           public.user_role not null,
  permission_key text not null,
  enabled        boolean not null,
  changed_by     uuid references public.user (id) on delete set null,
  changed_at     timestamptz not null default now(),
  primary key (school_id, role, permission_key),
  -- FR-011 / SC-009: only a catalogue row can be switched.
  constraint school_role_permission_catalogue_fk
    foreign key (role, permission_key)
    references public.optional_permission (role, permission_key)
);

create index school_role_permission_school_role_idx
  on public.school_role_permission (school_id, role);

comment on table public.school_role_permission is
  'Per-school optional switches. Composite FK to optional_permission makes never-grantable keys unstorable (FR-011).';

-- ── 2. Never-grantable invariant (access-matrix §1 ✗ cells) ─────────────────
-- Also refuses any key for super_admin (FR-024) and portal.* keys on any role
-- other than guardian / student (no portal scope widening).
create or replace function public.is_never_grantable(p_role public.user_role, p_key text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_role = 'super_admin'
      or (p_key like 'portal.%' and p_role not in ('guardian', 'student'))
      or (p_role::text, p_key) in (values
      ('principal', 'finance.read'),
      ('principal', 'finance.write'),
      ('principal', 'users.manage'),
      ('principal', 'settings.manage'),
      ('student_affairs', 'finance.read'),
      ('student_affairs', 'finance.write'),
      ('student_affairs', 'finance.export'),
      ('student_affairs', 'users.manage'),
      ('student_affairs', 'settings.manage'),
      ('teacher', 'finance.read'),
      ('teacher', 'finance.totals'),
      ('teacher', 'finance.write'),
      ('teacher', 'finance.export'),
      ('teacher', 'students.fee_indicator'),
      ('teacher', 'students.write'),
      ('teacher', 'students.delete'),
      ('teacher', 'structure.write'),
      ('teacher', 'users.manage'),
      ('teacher', 'settings.manage'),
      ('accountant', 'users.manage'),
      ('accountant', 'settings.manage'),
      ('viewer', 'finance.write'),
      ('viewer', 'users.manage'),
      ('viewer', 'settings.manage'),
      ('guardian', 'finance.read'),
      ('guardian', 'finance.totals'),
      ('guardian', 'finance.write'),
      ('guardian', 'finance.export'),
      ('guardian', 'sms.send_manual'),
      ('guardian', 'students.fee_indicator'),
      ('guardian', 'students.write'),
      ('guardian', 'students.delete'),
      ('guardian', 'students.export'),
      ('guardian', 'structure.write'),
      ('guardian', 'users.read'),
      ('guardian', 'users.manage'),
      ('guardian', 'settings.read'),
      ('guardian', 'settings.manage'),
      ('guardian', 'portal.self'),
      ('student', 'finance.read'),
      ('student', 'finance.totals'),
      ('student', 'finance.write'),
      ('student', 'finance.export'),
      ('student', 'sms.send_manual'),
      ('student', 'students.fee_indicator'),
      ('student', 'students.write'),
      ('student', 'students.delete'),
      ('student', 'students.export'),
      ('student', 'structure.write'),
      ('student', 'users.read'),
      ('student', 'users.manage'),
      ('student', 'settings.read'),
      ('student', 'settings.manage'),
      ('student', 'portal.linked')
      );
$$;

comment on function public.is_never_grantable(public.user_role, text) is
  'FR-011: true when (role, key) may never be granted, by default or by switch.';

revoke execute on function public.is_never_grantable(public.user_role, text) from public, anon, authenticated;
grant execute on function public.is_never_grantable(public.user_role, text) to service_role;

create or replace function public.trg_catalogue_never_grantable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_never_grantable(new.role, new.permission_key) then
    raise exception 'NOT_GRANTABLE' using
      errcode = 'P0001',
      hint = 'هذه الصلاحية غير قابلة للمنح لهذا الدور.';
  end if;
  return new;
end;
$$;

revoke execute on function public.trg_catalogue_never_grantable() from public, anon, authenticated;

create trigger role_permission_default_never_grantable
  before insert or update on public.role_permission_default
  for each row execute function public.trg_catalogue_never_grantable();

create trigger optional_permission_never_grantable
  before insert or update on public.optional_permission
  for each row execute function public.trg_catalogue_never_grantable();

-- ── 3. Seed: permission keys (access-matrix §1 enforced, §2 not yet) ────────
insert into public.permission (key, module, action, stage_scopable, enforced, label_ar) values
  ('school.profile_read', 'school', 'view', false, true, 'عرض بيانات المدرسة'),
  ('finance.read', 'finance', 'view', false, true, 'عرض البيانات المالية'),
  ('finance.totals', 'finance', 'totals', false, true, 'عرض الإجماليات المالية'),
  ('finance.write', 'finance', 'edit', false, true, 'تسجيل العمليات المالية'),
  ('finance.export', 'finance', 'export', false, true, 'تصدير التقارير المالية'),
  ('sms.send_manual', 'sms', 'send', true, true, 'إرسال رسائل SMS يدوية'),
  ('students.read', 'students', 'view', true, true, 'عرض بيانات الطلاب'),
  ('students.read_limited', 'students', 'view_limited', true, true, 'عرض بيانات طلاب الفصول المسندة'),
  ('students.guardian_contact', 'students', 'view_guardian', true, true, 'عرض بيانات ولي الأمر'),
  ('students.fee_indicator', 'students', 'view_fee_indicator', true, true, 'عرض مؤشر حالة الرسوم'),
  ('students.write', 'students', 'edit', true, true, 'تسجيل الطلاب وتعديل بياناتهم'),
  ('students.delete', 'students', 'delete', true, true, 'حذف الطلاب'),
  ('students.export', 'students', 'export', true, true, 'تصدير بيانات الطلاب'),
  ('structure.read', 'structure', 'view', true, true, 'عرض السنوات الدراسية والفصول'),
  ('structure.write', 'structure', 'edit', false, true, 'تعديل السنوات الدراسية والفصول'),
  ('users.read', 'users', 'view', false, true, 'عرض المستخدمين وسجل الصلاحيات'),
  ('users.manage', 'users', 'manage', false, true, 'إدارة المستخدمين والصلاحيات'),
  ('settings.read', 'settings', 'view', false, true, 'عرض الإعدادات'),
  ('settings.manage', 'settings', 'manage', false, true, 'تعديل الإعدادات'),
  ('portal.linked', 'portal', 'view_linked', false, true, 'عرض بيانات الأبناء المرتبطين'),
  ('portal.self', 'portal', 'view_self', false, true, 'عرض البيانات الشخصية'),
  ('academics.view', 'academics', 'view', true, false, 'الشؤون الأكاديمية: عرض'),
  ('academics.create', 'academics', 'create', true, false, 'الشؤون الأكاديمية: إضافة'),
  ('academics.edit', 'academics', 'edit', true, false, 'الشؤون الأكاديمية: تعديل'),
  ('academics.approve', 'academics', 'approve', true, false, 'الشؤون الأكاديمية: اعتماد'),
  ('attendance.view', 'attendance', 'view', true, false, 'الحضور: عرض'),
  ('attendance.create', 'attendance', 'create', true, false, 'الحضور: تسجيل'),
  ('attendance.edit', 'attendance', 'edit', true, false, 'الحضور: تعديل'),
  ('attendance.approve', 'attendance', 'approve', true, false, 'الحضور: اعتماد'),
  ('homework.view', 'homework', 'view', true, false, 'الواجبات: عرض'),
  ('homework.create', 'homework', 'create', true, false, 'الواجبات: إضافة'),
  ('homework.edit', 'homework', 'edit', true, false, 'الواجبات: تعديل'),
  ('homework.publish', 'homework', 'publish', true, false, 'الواجبات: نشر'),
  ('exams.view', 'exams', 'view', true, false, 'الاختبارات والنتائج: عرض'),
  ('exams.create', 'exams', 'create', true, false, 'الاختبارات والنتائج: إضافة'),
  ('exams.edit', 'exams', 'edit', true, false, 'الاختبارات والنتائج: تعديل الدرجات'),
  ('exams.approve', 'exams', 'approve', true, false, 'الاختبارات والنتائج: اعتماد'),
  ('exams.publish', 'exams', 'publish', true, false, 'الاختبارات والنتائج: نشر'),
  ('announcements.view', 'announcements', 'view', true, false, 'الإعلانات: عرض'),
  ('announcements.create', 'announcements', 'create', true, false, 'الإعلانات: إضافة'),
  ('announcements.edit', 'announcements', 'edit', true, false, 'الإعلانات: تعديل'),
  ('announcements.approve', 'announcements', 'approve', true, false, 'الإعلانات: اعتماد'),
  ('announcements.publish', 'announcements', 'publish', true, false, 'الإعلانات: نشر'),
  ('announcements.publish_own', 'announcements', 'publish_own', true, false, 'الإعلانات: نشر إعلاناته الخاصة'),
  ('cms.view', 'cms', 'view', false, false, 'موقع المدرسة: عرض'),
  ('cms.create', 'cms', 'create', false, false, 'موقع المدرسة: إضافة'),
  ('cms.edit', 'cms', 'edit', false, false, 'موقع المدرسة: تعديل'),
  ('cms.approve', 'cms', 'approve', false, false, 'موقع المدرسة: اعتماد'),
  ('cms.publish', 'cms', 'publish', false, false, 'موقع المدرسة: نشر');


-- ── 4. Seed: role defaults (D cells of §1 + §2 defaults) ────────────────────
insert into public.role_permission_default (role, permission_key) values
  ('school_admin', 'school.profile_read'),
  ('school_admin', 'finance.read'),
  ('school_admin', 'finance.totals'),
  ('school_admin', 'finance.write'),
  ('school_admin', 'finance.export'),
  ('school_admin', 'sms.send_manual'),
  ('school_admin', 'students.read'),
  ('school_admin', 'students.write'),
  ('school_admin', 'students.delete'),
  ('school_admin', 'students.export'),
  ('school_admin', 'structure.read'),
  ('school_admin', 'structure.write'),
  ('school_admin', 'users.read'),
  ('school_admin', 'users.manage'),
  ('school_admin', 'settings.read'),
  ('school_admin', 'settings.manage'),
  ('school_admin', 'academics.view'),
  ('school_admin', 'academics.create'),
  ('school_admin', 'academics.edit'),
  ('school_admin', 'academics.approve'),
  ('school_admin', 'attendance.view'),
  ('school_admin', 'attendance.create'),
  ('school_admin', 'attendance.edit'),
  ('school_admin', 'attendance.approve'),
  ('school_admin', 'homework.view'),
  ('school_admin', 'homework.create'),
  ('school_admin', 'homework.edit'),
  ('school_admin', 'homework.publish'),
  ('school_admin', 'exams.view'),
  ('school_admin', 'exams.create'),
  ('school_admin', 'exams.edit'),
  ('school_admin', 'exams.approve'),
  ('school_admin', 'exams.publish'),
  ('school_admin', 'announcements.view'),
  ('school_admin', 'announcements.create'),
  ('school_admin', 'announcements.edit'),
  ('school_admin', 'announcements.approve'),
  ('school_admin', 'announcements.publish'),
  ('school_admin', 'announcements.publish_own'),
  ('school_admin', 'cms.view'),
  ('school_admin', 'cms.create'),
  ('school_admin', 'cms.edit'),
  ('school_admin', 'cms.approve'),
  ('school_admin', 'cms.publish'),
  ('principal', 'school.profile_read'),
  ('principal', 'finance.totals'),
  ('principal', 'students.read'),
  ('principal', 'students.export'),
  ('principal', 'structure.read'),
  ('principal', 'users.read'),
  ('principal', 'settings.read'),
  ('principal', 'academics.view'),
  ('principal', 'academics.create'),
  ('principal', 'academics.edit'),
  ('principal', 'academics.approve'),
  ('principal', 'attendance.view'),
  ('principal', 'attendance.approve'),
  ('principal', 'homework.view'),
  ('principal', 'exams.view'),
  ('principal', 'exams.approve'),
  ('principal', 'exams.publish'),
  ('principal', 'announcements.view'),
  ('principal', 'announcements.create'),
  ('principal', 'announcements.edit'),
  ('principal', 'announcements.approve'),
  ('principal', 'announcements.publish'),
  ('principal', 'announcements.publish_own'),
  ('principal', 'cms.view'),
  ('principal', 'cms.create'),
  ('principal', 'cms.edit'),
  ('principal', 'cms.approve'),
  ('principal', 'cms.publish'),
  ('student_affairs', 'school.profile_read'),
  ('student_affairs', 'students.read'),
  ('student_affairs', 'students.write'),
  ('student_affairs', 'students.export'),
  ('student_affairs', 'structure.read'),
  ('student_affairs', 'academics.view'),
  ('student_affairs', 'attendance.view'),
  ('student_affairs', 'attendance.create'),
  ('student_affairs', 'attendance.edit'),
  ('student_affairs', 'homework.view'),
  ('student_affairs', 'exams.view'),
  ('student_affairs', 'announcements.view'),
  ('student_affairs', 'announcements.create'),
  ('student_affairs', 'announcements.edit'),
  ('student_affairs', 'cms.view'),
  ('student_affairs', 'cms.create'),
  ('student_affairs', 'cms.edit'),
  ('teacher', 'school.profile_read'),
  ('teacher', 'students.read_limited'),
  ('teacher', 'structure.read'),
  ('teacher', 'academics.view'),
  ('teacher', 'attendance.view'),
  ('teacher', 'attendance.create'),
  ('teacher', 'attendance.edit'),
  ('teacher', 'homework.view'),
  ('teacher', 'homework.create'),
  ('teacher', 'homework.edit'),
  ('teacher', 'homework.publish'),
  ('teacher', 'exams.view'),
  ('teacher', 'exams.create'),
  ('teacher', 'exams.edit'),
  ('teacher', 'announcements.view'),
  ('teacher', 'announcements.create'),
  ('accountant', 'school.profile_read'),
  ('accountant', 'finance.read'),
  ('accountant', 'finance.totals'),
  ('accountant', 'finance.write'),
  ('accountant', 'finance.export'),
  ('accountant', 'sms.send_manual'),
  ('accountant', 'students.read'),
  ('accountant', 'students.write'),
  ('accountant', 'students.export'),
  ('accountant', 'structure.read'),
  ('accountant', 'structure.write'),
  ('accountant', 'announcements.view'),
  ('viewer', 'school.profile_read'),
  ('viewer', 'finance.read'),
  ('viewer', 'finance.totals'),
  ('viewer', 'students.read'),
  ('viewer', 'students.export'),
  ('viewer', 'structure.read'),
  ('viewer', 'announcements.view'),
  ('guardian', 'school.profile_read'),
  ('guardian', 'portal.linked'),
  ('guardian', 'academics.view'),
  ('guardian', 'attendance.view'),
  ('guardian', 'homework.view'),
  ('guardian', 'exams.view'),
  ('guardian', 'announcements.view'),
  ('student', 'school.profile_read'),
  ('student', 'portal.self'),
  ('student', 'academics.view'),
  ('student', 'attendance.view'),
  ('student', 'homework.view'),
  ('student', 'exams.view'),
  ('student', 'announcements.view');


-- ── 5. Seed: FR-010 optional switches (no principal finance switch, R15) ────
insert into public.optional_permission (role, permission_key, default_enabled, label_ar) values
  ('teacher', 'students.guardian_contact', false, 'عرض بيانات ولي الأمر'),
  ('teacher', 'announcements.publish_own', false, 'نشر إعلاناته الخاصة'),
  ('student_affairs', 'students.fee_indicator', false, 'عرض مؤشر حالة الرسوم'),
  ('student_affairs', 'sms.send_manual', false, 'إرسال رسائل SMS يدوية'),
  ('principal', 'structure.write', false, 'تعديل السنوات الدراسية والفصول'),
  ('viewer', 'finance.export', true, 'تصدير التقارير المالية');


-- ── 6. RLS + grants (Article IV checklist) ──────────────────────────────────
alter table public.permission enable row level security;
alter table public.permission force row level security;
alter table public.role_permission_default enable row level security;
alter table public.role_permission_default force row level security;
alter table public.optional_permission enable row level security;
alter table public.optional_permission force row level security;
alter table public.school_role_permission enable row level security;
alter table public.school_role_permission force row level security;

-- Reference data (allow-listed in the policy audit).
create policy "permission_read_all"
  on public.permission for select to authenticated using (true);
create policy "role_permission_default_read_all"
  on public.role_permission_default for select to authenticated using (true);
create policy "optional_permission_read_all"
  on public.optional_permission for select to authenticated using (true);
-- school_role_permission: users.read policy added in 0037 (needs has_perm).
-- Writes only through set_optional_permission (0046).

revoke all on table public.permission from anon, authenticated;
revoke all on table public.role_permission_default from anon, authenticated;
revoke all on table public.optional_permission from anon, authenticated;
revoke all on table public.school_role_permission from anon, authenticated;
grant select on table public.permission to authenticated;
grant select on table public.role_permission_default to authenticated;
grant select on table public.optional_permission to authenticated;
grant select on table public.school_role_permission to authenticated;

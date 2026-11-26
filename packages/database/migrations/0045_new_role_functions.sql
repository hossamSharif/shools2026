-- ============================================================================
-- 0045_new_role_functions (spec 002, rpc-contracts §A/§C, data-model §10,
-- tasks T066). New definer functions + storage RLS ⇒ OWNER REVIEW (XII).
--
-- * teacher_roster(): the teacher's limited student view (FR-008, FR-016).
--   Rows only for sections in teacher_section_ids() (empty until feature 02)
--   in the current academic year; guardian contact only with the optional
--   students.guardian_contact switch. No finance columns at all.
-- * register_student(): student + enrollment in one transaction for writers
--   whose students.write is stage-scoped (they cannot insert a bare student,
--   0038); the grade's stage must be inside their scope. The existing
--   enrollment trigger generates the installments exactly as today (FR-022).
--   Returns only the new student's id. Write-gated (stricter than Phase 1
--   table writes, safe because it is a new path).
-- * student-photos: a PRIVATE bucket (Article XVI, FR-008a). Object path
--   <school_id>/<student_id>/<file>. Read = can_read_student or the teacher's
--   allocated scope; write = can_write_student. No anon policy. The web serves
--   photos only as 5-minute signed URLs.
-- * student_directory (checked wrapper): fin_status for indicator-only callers
--   is folded to paid / partial / unpaid (no 'overdue', no due-date filter),
--   and the money sorts need finance.read (they leaked through row order).
-- ============================================================================

-- ── Helpers ─────────────────────────────────────────────────────────────────

-- NULL for anything that is not a uuid (storage path segments are free text).
create or replace function public.safe_uuid(p text)
returns uuid
language sql
immutable
set search_path = public
as $$
  select case when p ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then p::uuid end;
$$;

-- The student is enrolled, this academic year, in a section allocated to the
-- calling teacher (relationship scope; always false until feature 02).
create or replace function public.teacher_can_see_student(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_student_id is not null
     and public.has_perm('students.read_limited')
     and exists (
       select 1
         from public.enrollment e
         join public.academic_year ay
           on ay.id = e.academic_year_id and ay.school_id = e.school_id and ay.is_current
        where e.student_id = p_student_id
          and e.school_id = public.current_school_id()
          and e.section_id = any(public.teacher_section_ids()));
$$;

comment on function public.teacher_can_see_student(uuid) is
  'True when the student is in a section allocated to the calling teacher this year (relationship scope).';

-- ── teacher_roster ──────────────────────────────────────────────────────────
create or replace function public.teacher_roster(p_section_id uuid default null)
returns table (
  student_id uuid, name text, photo_path text, grade_id uuid, grade_label text,
  section_id uuid, section_name text, enrollment_status text,
  guardian_name text, guardian_phone text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_contact boolean;
begin
  perform public.assert_perm('students.read_limited');
  v_contact := public.has_perm('students.guardian_contact');
  return query
  select s.id, s.name, s.photo_path, g.id, g.label_ar, sec.id, sec.name, s.status::text,
         case when v_contact then s.guardian_name end,
         case when v_contact then s.guardian_phone end
    from public.enrollment e
    join public.academic_year ay
      on ay.id = e.academic_year_id and ay.school_id = e.school_id and ay.is_current
    join public.student s on s.id = e.student_id
    join public.grade g on g.id = e.grade_id
    join public.section sec on sec.id = e.section_id
   where e.school_id = public.current_school_id()
     and e.section_id = any(public.teacher_section_ids())
     and (p_section_id is null or e.section_id = p_section_id)
   order by sec.name, s.name;
end;
$$;

comment on function public.teacher_roster(uuid) is
  'Teacher''s allocated students with the FR-008 fields; guardian contact only with students.guardian_contact.';

-- ── register_student ────────────────────────────────────────────────────────
create or replace function public.register_student(p_student jsonb, p_enrollment jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_school  uuid;
  v_scope   uuid[];
  v_grade   uuid := public.safe_uuid(p_enrollment ->> 'grade_id');
  v_section uuid := public.safe_uuid(p_enrollment ->> 'section_id');
  v_year    uuid := public.safe_uuid(p_enrollment ->> 'academic_year_id');
  v_stage   uuid;
  v_name    text := nullif(trim(p_student ->> 'name'), '');
  v_status  public.student_status := coalesce(nullif(p_student ->> 'status', ''), 'active')::public.student_status;
  v_id      uuid;
begin
  perform public.assert_perm('students.write');
  v_school := public.current_school_id();
  perform public.assert_writes_allowed(v_school);

  if v_name is null or length(v_name) > 200 then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', hint = 'اسم الطالب مطلوب.';
  end if;
  select g.stage_id into v_stage
    from public.grade g
    join public.section sec on sec.grade_id = g.id and sec.id = v_section and sec.school_id = v_school
   where g.id = v_grade;
  if v_stage is null
     or not exists (select 1 from public.academic_year ay where ay.id = v_year and ay.school_id = v_school) then
    raise exception 'NOT_FOUND' using errcode = 'P0001',
      hint = 'الصف أو الشعبة أو السنة الدراسية غير موجودة في مدرستك.';
  end if;

  v_scope := public.perm_scope('students.write');
  if v_scope is not null and not (v_stage = any(v_scope)) then
    raise exception 'FORBIDDEN_PERMISSION' using errcode = 'P0001',
      hint = 'هذه المرحلة خارج نطاق صلاحياتك.';
  end if;

  insert into public.student (school_id, name, guardian_name, guardian_phone, status)
  values (v_school, v_name,
          nullif(trim(p_student ->> 'guardian_name'), ''),
          nullif(trim(p_student ->> 'guardian_phone'), ''),
          v_status)
  returning id into v_id;

  -- enrollment_generate_installments runs here, as for every enrollment.
  insert into public.enrollment (school_id, student_id, grade_id, section_id, academic_year_id)
  values (v_school, v_id, v_grade, v_section, v_year);

  return v_id;
end;
$$;

comment on function public.register_student(jsonb, jsonb) is
  'Student + enrollment in one transaction for stage-scoped writers (R7); returns the student id only.';

-- ── Grants ──────────────────────────────────────────────────────────────────
revoke execute on function public.safe_uuid(text) from public, anon;
grant execute on function public.safe_uuid(text) to authenticated, service_role;
revoke execute on function public.teacher_can_see_student(uuid) from public, anon;
revoke execute on function public.teacher_roster(uuid) from public, anon;
revoke execute on function public.register_student(jsonb, jsonb) from public, anon;
grant execute on function public.teacher_can_see_student(uuid) to authenticated, service_role;
grant execute on function public.teacher_roster(uuid) to authenticated, service_role;
grant execute on function public.register_student(jsonb, jsonb) to authenticated;

-- ── Private student-photos bucket + storage policies ────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('student-photos', 'student-photos', false, 2097152,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "student_photos_select" on storage.objects;
drop policy if exists "student_photos_insert" on storage.objects;
drop policy if exists "student_photos_update" on storage.objects;
drop policy if exists "student_photos_delete" on storage.objects;

create policy "student_photos_select" on storage.objects for select to authenticated
  using (
    bucket_id = 'student-photos'
    and (storage.foldername(name))[1] = (select public.current_school_id())::text
    and (public.can_read_student(public.safe_uuid((storage.foldername(name))[2]))
         or public.teacher_can_see_student(public.safe_uuid((storage.foldername(name))[2])))
  );
create policy "student_photos_insert" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'student-photos'
    and (storage.foldername(name))[1] = (select public.current_school_id())::text
    and public.can_write_student(public.safe_uuid((storage.foldername(name))[2]))
  );
create policy "student_photos_update" on storage.objects for update to authenticated
  using (
    bucket_id = 'student-photos'
    and (storage.foldername(name))[1] = (select public.current_school_id())::text
    and public.can_write_student(public.safe_uuid((storage.foldername(name))[2]))
  )
  with check (
    bucket_id = 'student-photos'
    and (storage.foldername(name))[1] = (select public.current_school_id())::text
    and public.can_write_student(public.safe_uuid((storage.foldername(name))[2]))
  );
create policy "student_photos_delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'student-photos'
    and (storage.foldername(name))[1] = (select public.current_school_id())::text
    and public.can_write_student(public.safe_uuid((storage.foldername(name))[2]))
  );

-- ── student_directory: fee indicator is three-state for indicator-only callers
-- (spec FR: "paid / partially paid / unpaid, no amounts"). Only the checked
-- wrapper from 0039 changes; finance.read holders get exactly the 0039 result.
-- The fin_status filter is applied after folding, so a "partial" filter matches
-- the label the caller sees; p_due_within_days and 'overdue' are refused.
-- The money sorts (owed_desc, oldest_overdue) now need finance.read: the row
-- order alone revealed who owes most to callers who see no amounts.
CREATE OR REPLACE FUNCTION public.student_directory(p_school_id uuid, p_q text DEFAULT NULL::text, p_stage_id uuid DEFAULT NULL::uuid, p_grade_id uuid DEFAULT NULL::uuid, p_section_id uuid DEFAULT NULL::uuid, p_academic_year_id uuid DEFAULT NULL::uuid, p_status text DEFAULT NULL::text, p_fin_status text DEFAULT NULL::text, p_due_within_days integer DEFAULT NULL::integer, p_unenrolled boolean DEFAULT false, p_missing_phone boolean DEFAULT false, p_sort text DEFAULT 'name'::text)
 RETURNS TABLE(student_id uuid, name text, guardian_name text, guardian_phone text, status text, grade_id uuid, grade_label text, section_id uuid, section_name text, academic_year_id uuid, total_charged numeric, total_paid numeric, total_discount numeric, total_owed numeric, overdue_amount numeric, days_overdue integer, next_due_date date, next_due_amount numeric, installments_total integer, installments_settled integer, fin_status text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_fin   boolean := public.has_perm('finance.read');
  v_ind   boolean := v_fin or public.has_perm('students.fee_indicator');
  -- Indicator only (no finance.read): paid / partial / unpaid, no amounts and
  -- no dates, so 'overdue' is folded into partial/unpaid (0045).
  v_only  boolean := v_ind and not v_fin;
  v_scope uuid[];
begin
  perform public.assert_perm('students.read');
  -- The money sorts order rows by amount owed or days overdue, which reveals
  -- finance data through the order alone: finance.read only (0045).
  if (not v_ind and (p_fin_status is not null or p_due_within_days is not null))
     or (v_only and (p_due_within_days is not null
                     or p_fin_status not in ('paid', 'partial', 'unpaid')))
     or (not v_fin and p_sort in ('owed_desc', 'oldest_overdue')) then
    raise exception 'FORBIDDEN_PERMISSION' using
      errcode = 'P0001',
      hint = 'لا تملك صلاحية تنفيذ هذا الإجراء.';
  end if;
  v_scope := public.perm_scope('students.read');

  return query
  select x.student_id, x.name, x.guardian_name, x.guardian_phone, x.status,
         x.grade_id, x.grade_label, x.section_id, x.section_name, x.academic_year_id,
         x.total_charged, x.total_paid, x.total_discount, x.total_owed, x.overdue_amount,
         x.days_overdue, x.next_due_date, x.next_due_amount, x.installments_total,
         x.installments_settled, x.fin_status
    from (
      select d.ordinality,
             d.student_id,
             d.name,
             d.guardian_name,
             d.guardian_phone,
             d.status,
             d.grade_id,
             d.grade_label,
             d.section_id,
             d.section_name,
             d.academic_year_id,
             case when v_fin then d.total_charged end as total_charged,
             case when v_fin then d.total_paid end as total_paid,
             case when v_fin then d.total_discount end as total_discount,
             case when v_fin then d.total_owed end as total_owed,
             case when v_fin then d.overdue_amount end as overdue_amount,
             case when v_fin then d.days_overdue end as days_overdue,
             case when v_fin then d.next_due_date end as next_due_date,
             case when v_fin then d.next_due_amount end as next_due_amount,
             case when v_fin then d.installments_total end as installments_total,
             case when v_fin then d.installments_settled end as installments_settled,
             case when v_fin then d.fin_status
                  when v_ind then
                    case when d.fin_status = 'overdue'
                         then case when d.total_paid > 0 then 'partial' else 'unpaid' end
                         else d.fin_status end
             end as fin_status
        from public.student_directory_unchecked(p_school_id, p_q, p_stage_id, p_grade_id, p_section_id, p_academic_year_id, p_status,
               case when v_only then null else p_fin_status end,
               p_due_within_days, p_unenrolled, p_missing_phone, p_sort) with ordinality as d
       where v_scope is null or public.student_stage_id(d.student_id) = any(v_scope)
    ) x
   where not v_only or p_fin_status is null or x.fin_status = p_fin_status
   order by x.ordinality;
end;
$function$;

-- ── Reviewed allow-list (0041): + teacher_roster, register_student, teacher_can_see_student
create or replace function public.reviewed_definer_functions()
returns text[]
language sql
immutable
set search_path = public
as $$
  select array[
    -- Phase 1 tenant resolution and gating helpers
    'current_school_id', 'current_role', 'current_is_super_admin',
    'subscription_state', 'assert_writes_allowed', 'assert_target_school',
    -- Phase 1 profile
    'update_own_display_name',
    -- Feature 002 decision helpers (0037)
    'my_access', 'my_role_set', 'has_perm', 'perm_scope', 'assert_perm',
    'current_year_id', 'student_stage_id', 'can_read_student', 'can_write_student',
    'teacher_section_ids', 'portal_student_ids',
    -- Money RPCs (finance.write, 0039)
    'apply_fee_payment', 'record_expense', 'record_transfer', 'record_refund',
    'record_adjustment', 'apply_discount', 'reverse_event', 'record_opening_balance',
    -- Derived reads (0039)
    'account_balance', 'installment_running_balance', 'student_balance', 'sms_credit_balance',
    'student_statement', 'student_payments', 'receivables_aging', 'dashboard_kpis',
    'student_directory', 'student_financial_summary', 'student_installments',
    -- Super-admin only (checks current_is_super_admin itself)
    'topup_sms_credit', 'superadmin_set_school_admin',
    -- Manual SMS gate (0042)
    'authorize_manual_sms',
    -- User management (0044): users.read / users.manage checked inside
    'list_school_users', 'list_invitations', 'create_invitation', 'issue_invitation_token',
    'revoke_invitation', 'set_user_roles', 'deactivate_user', 'reactivate_user',
    -- New roles (0045)
    'teacher_roster', 'register_student', 'teacher_can_see_student'
  ]::text[];
$$;

revoke execute on function public.reviewed_definer_functions() from public, anon, authenticated;
grant execute on function public.reviewed_definer_functions() to service_role;

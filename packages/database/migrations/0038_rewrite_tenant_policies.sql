-- ============================================================================
-- 0038_rewrite_tenant_policies (spec 002, data-model §10, tasks T028/T029).
-- TOUCHES RLS ON EVERY TENANT TABLE ⇒ OWNER REVIEW before apply (Article XII).
-- Apply together with 0039–0041 (T033).
--
-- Replaces Phase 1's "any signed-in user of the school sees every row"
-- (FR-013, FR-019–FR-021). Every tenant policy now requires a permission key
-- or a relationship helper as well as school_id = current_school_id(). Helpers
-- are always called as (select fn(...)) so they run once per statement.
--
-- Phase 1 roles see the same rows as before (US2): school_admin, accountant
-- and viewer hold every key the old policies effectively granted them. The
-- intended tightening is only that viewers lose the direct table writes the
-- old *_tenant_rw policies allowed (the UI never offered them, research R0).
--
-- Super-admin policies keep their exact meaning; they now call
-- current_is_super_admin() instead of current_role() so the policy audit can
-- forbid authorization on user.role everywhere else (R11).
--
-- Relationship-scoped grants (the "(rel)" cells: a teacher's structure.read,
-- portal keys) give no direct rows: they are flagged in the catalogue, and
-- perm_scope() returns '{}' for them. Access comes only through
-- teacher_section_ids() / portal_student_ids().
-- ============================================================================

-- ── 1. Relationship-scoped grants in the catalogue ──────────────────────────
alter table public.role_permission_default
  add column relationship_scoped boolean not null default false;
alter table public.optional_permission
  add column relationship_scoped boolean not null default false;

update public.role_permission_default d
   set relationship_scoped = true
  from (values
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
    ('guardian', 'portal.linked'),
    ('guardian', 'academics.view'),
    ('guardian', 'attendance.view'),
    ('guardian', 'homework.view'),
    ('guardian', 'exams.view'),
    ('guardian', 'announcements.view'),
    ('student', 'portal.self'),
    ('student', 'academics.view'),
    ('student', 'attendance.view'),
    ('student', 'homework.view'),
    ('student', 'exams.view'),
    ('student', 'announcements.view')
  ) as v(role, permission_key)
 where d.role = v.role::public.user_role and d.permission_key = v.permission_key;

update public.optional_permission o
   set relationship_scoped = true
  from (values
    ('teacher', 'students.guardian_contact'),
    ('teacher', 'announcements.publish_own')
  ) as v(role, permission_key)
 where o.role = v.role::public.user_role and o.permission_key = v.permission_key;

-- perm_scope(): relationship-scoped grants contribute no direct scope ('{}').
create or replace function public.perm_scope(p_key text)
returns uuid[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_assignments uuid[];
  v_scopable    boolean;
  v_stages      uuid[];
begin
  if public.is_service_caller() then
    return null;
  end if;

  select array_agg(distinct g.assignment_id) into v_assignments
    from public.my_effective_grants() g
   where g.permission_key = p_key
     and not exists (select 1 from public.role_permission_default d
                      where d.role = g.role and d.permission_key = p_key and d.relationship_scoped)
     and not exists (select 1 from public.optional_permission o
                      where o.role = g.role and o.permission_key = p_key and o.relationship_scoped);
  if v_assignments is null then
    return '{}'::uuid[];
  end if;

  select p.stage_scopable into v_scopable from public.permission p where p.key = p_key;
  if not coalesce(v_scopable, false) then
    return null;
  end if;

  if exists (
    select 1 from unnest(v_assignments) as x(id)
     where not exists (select 1 from public.role_assignment_stage s where s.assignment_id = x.id)
  ) then
    return null;
  end if;

  select array_agg(distinct s.stage_id) into v_stages
    from public.role_assignment_stage s
   where s.assignment_id = any(v_assignments);
  return coalesce(v_stages, '{}'::uuid[]);
end;
$$;

comment on function public.perm_scope(text) is
  'Direct stage scope of a key: NULL school-wide, ''{}'' none (or relationship-scoped only), else stage ids (FR-018a).';

-- ── 2. Drop every Phase 1 tenant and super-admin policy (live names) ────────

drop policy if exists "academic_year_tenant_rw" on public.academic_year;
drop policy if exists "account_tenant_rw" on public.account;
drop policy if exists "audit_entry_tenant_read" on public.audit_entry;
drop policy if exists "discount_tenant_read" on public.discount;
drop policy if exists "enrollment_tenant_rw" on public.enrollment;
drop policy if exists "fee_item_tenant_rw" on public.fee_item;
drop policy if exists "fee_structure_tenant_rw" on public.fee_structure;
drop policy if exists "installment_tenant_read" on public.installment;
drop policy if exists "installment_schedule_tenant_rw" on public.installment_schedule;
drop policy if exists "money_event_tenant_read" on public.money_event;
drop policy if exists "notification_own_mark_read" on public.notification;
drop policy if exists "notification_own_read" on public.notification;
drop policy if exists "payment_allocation_tenant_read" on public.payment_allocation;
drop policy if exists "receipt_counter_tenant_read" on public.receipt_counter;
drop policy if exists "reminder_rule_tenant_rw" on public.reminder_rule;
drop policy if exists "school_admin_update_own" on public.school;
drop policy if exists "school_superadmin_all" on public.school;
drop policy if exists "school_tenant_read" on public.school;
drop policy if exists "section_tenant_rw" on public.section;
drop policy if exists "sms_consumption_tenant_read" on public.sms_credit_consumption;
drop policy if exists "sms_topup_superadmin_all" on public.sms_credit_topup;
drop policy if exists "sms_topup_tenant_read" on public.sms_credit_topup;
drop policy if exists "sms_message_log_tenant_read" on public.sms_message_log;
drop policy if exists "student_tenant_rw" on public.student;
drop policy if exists "subscription_superadmin_all" on public.subscription;
drop policy if exists "subscription_tenant_read" on public.subscription;
drop policy if exists "user_same_school_select" on public.user;
drop policy if exists "user_self_select" on public.user;
drop policy if exists "user_superadmin_all" on public.user;

-- ── 3. school, subscription ─────────────────────────────────────────────────
create policy "school_select" on public.school for select to authenticated
  using (
    id = (select public.current_school_id())
    and (select public.has_perm('school.profile_read'))
  );
create policy "school_update" on public.school for update to authenticated
  using (
    id = (select public.current_school_id())
    and (select public.has_perm('settings.manage'))
  )
  with check (
    id = (select public.current_school_id())
    and (select public.has_perm('settings.manage'))
  );
create policy "school_superadmin_all" on public.school for all to authenticated
  using ((select public.current_is_super_admin()))
  with check ((select public.current_is_super_admin()));

create policy "subscription_select" on public.subscription for select to authenticated
  using (
    school_id = (select public.current_school_id())
    and (select public.has_perm('school.profile_read'))
  );
create policy "subscription_superadmin_all" on public.subscription for all to authenticated
  using ((select public.current_is_super_admin()))
  with check ((select public.current_is_super_admin()));

-- ── 4. academic_year, section (structure) ───────────────────────────────────
-- Years: any DIRECT structure.read grant (stage-scoped holders still see every year).
create policy "academic_year_select" on public.academic_year for select to authenticated
  using (
    school_id = (select public.current_school_id())
    and ((select public.perm_scope('structure.read')) is null
         or cardinality((select public.perm_scope('structure.read'))) > 0)
  );
create policy "academic_year_insert" on public.academic_year for insert to authenticated
  with check (
    school_id = (select public.current_school_id())
    and (select public.has_perm('structure.write'))
  );
create policy "academic_year_update" on public.academic_year for update to authenticated
  using (
    school_id = (select public.current_school_id())
    and (select public.has_perm('structure.write'))
  )
  with check (
    school_id = (select public.current_school_id())
    and (select public.has_perm('structure.write'))
  );
create policy "academic_year_delete" on public.academic_year for delete to authenticated
  using (
    school_id = (select public.current_school_id())
    and (select public.has_perm('structure.write'))
  );

-- Sections: school-wide, the grade's stage within scope, or allocated to the teacher.
create policy "section_select" on public.section for select to authenticated
  using (
    school_id = (select public.current_school_id())
    and ((select public.perm_scope('structure.read')) is null
         or exists (select 1 from public.grade g
                     where g.id = section.grade_id
                       and g.stage_id = any((select public.perm_scope('structure.read'))::uuid[]))
         or id = any((select public.teacher_section_ids())::uuid[]))
  );
create policy "section_insert" on public.section for insert to authenticated
  with check (
    school_id = (select public.current_school_id())
    and (select public.has_perm('structure.write'))
  );
create policy "section_update" on public.section for update to authenticated
  using (
    school_id = (select public.current_school_id())
    and (select public.has_perm('structure.write'))
  )
  with check (
    school_id = (select public.current_school_id())
    and (select public.has_perm('structure.write'))
  );
create policy "section_delete" on public.section for delete to authenticated
  using (
    school_id = (select public.current_school_id())
    and (select public.has_perm('structure.write'))
  );

-- ── 5. student, enrollment ──────────────────────────────────────────────────
-- Same rule as can_read_student(), inlined so the key/scope run once per statement.
create policy "student_select" on public.student for select to authenticated
  using (
    school_id = (select public.current_school_id())
    and (((select public.perm_scope('students.read')) is null and (select public.has_perm('students.read')))
         or public.student_stage_id(id) = any((select public.perm_scope('students.read'))::uuid[])
         or id = any((select public.portal_student_ids())::uuid[]))
  );
-- Bare inserts only for school-wide writers; stage-scoped writers use register_student (R7).
create policy "student_insert" on public.student for insert to authenticated
  with check (
    school_id = (select public.current_school_id())
    and (select public.has_perm('students.write'))
    and (select public.perm_scope('students.write')) is null
  );
create policy "student_update" on public.student for update to authenticated
  using (
    school_id = (select public.current_school_id())
    and (((select public.perm_scope('students.write')) is null and (select public.has_perm('students.write')))
         or public.student_stage_id(id) = any((select public.perm_scope('students.write'))::uuid[]))
  )
  with check (
    school_id = (select public.current_school_id())
    and (((select public.perm_scope('students.write')) is null and (select public.has_perm('students.write')))
         or public.student_stage_id(id) = any((select public.perm_scope('students.write'))::uuid[]))
  );
-- The Phase 1 guard_student_delete trigger still applies.
create policy "student_delete" on public.student for delete to authenticated
  using (
    school_id = (select public.current_school_id())
    and (select public.has_perm('students.delete'))
  );

create policy "enrollment_select" on public.enrollment for select to authenticated
  using (
    school_id = (select public.current_school_id())
    and (((select public.perm_scope('students.read')) is null and (select public.has_perm('students.read')))
         or public.student_stage_id(student_id) = any((select public.perm_scope('students.read'))::uuid[])
         or student_id = any((select public.portal_student_ids())::uuid[]))
  );
-- Writes: students.write, and the enrollment grade's stage within scope.
create policy "enrollment_insert" on public.enrollment for insert to authenticated
  with check (
    school_id = (select public.current_school_id())
    and (select public.has_perm('students.write'))
    and ((select public.perm_scope('students.write')) is null
         or (select g.stage_id from public.grade g where g.id = enrollment.grade_id)
            = any((select public.perm_scope('students.write'))::uuid[]))
  );
create policy "enrollment_update" on public.enrollment for update to authenticated
  using (
    school_id = (select public.current_school_id())
    and (select public.has_perm('students.write'))
    and ((select public.perm_scope('students.write')) is null
         or (select g.stage_id from public.grade g where g.id = enrollment.grade_id)
            = any((select public.perm_scope('students.write'))::uuid[]))
  )
  with check (
    school_id = (select public.current_school_id())
    and (select public.has_perm('students.write'))
    and ((select public.perm_scope('students.write')) is null
         or (select g.stage_id from public.grade g where g.id = enrollment.grade_id)
            = any((select public.perm_scope('students.write'))::uuid[]))
  );
create policy "enrollment_delete" on public.enrollment for delete to authenticated
  using (
    school_id = (select public.current_school_id())
    and (select public.has_perm('students.write'))
    and ((select public.perm_scope('students.write')) is null
         or (select g.stage_id from public.grade g where g.id = enrollment.grade_id)
            = any((select public.perm_scope('students.write'))::uuid[]))
  );

-- ── 6. Finance configuration: finance.read / finance.write ──────────────────
-- account
create policy "account_select" on public.account for select to authenticated
  using (
    school_id = (select public.current_school_id())
    and (select public.has_perm('finance.read'))
  );
create policy "account_insert" on public.account for insert to authenticated
  with check (
    school_id = (select public.current_school_id())
    and (select public.has_perm('finance.write'))
  );
create policy "account_update" on public.account for update to authenticated
  using (
    school_id = (select public.current_school_id())
    and (select public.has_perm('finance.write'))
  )
  with check (
    school_id = (select public.current_school_id())
    and (select public.has_perm('finance.write'))
  );
create policy "account_delete" on public.account for delete to authenticated
  using (
    school_id = (select public.current_school_id())
    and (select public.has_perm('finance.write'))
  );

-- fee_structure
create policy "fee_structure_select" on public.fee_structure for select to authenticated
  using (
    school_id = (select public.current_school_id())
    and (select public.has_perm('finance.read'))
  );
create policy "fee_structure_insert" on public.fee_structure for insert to authenticated
  with check (
    school_id = (select public.current_school_id())
    and (select public.has_perm('finance.write'))
  );
create policy "fee_structure_update" on public.fee_structure for update to authenticated
  using (
    school_id = (select public.current_school_id())
    and (select public.has_perm('finance.write'))
  )
  with check (
    school_id = (select public.current_school_id())
    and (select public.has_perm('finance.write'))
  );
create policy "fee_structure_delete" on public.fee_structure for delete to authenticated
  using (
    school_id = (select public.current_school_id())
    and (select public.has_perm('finance.write'))
  );

-- fee_item
create policy "fee_item_select" on public.fee_item for select to authenticated
  using (
    school_id = (select public.current_school_id())
    and (select public.has_perm('finance.read'))
  );
create policy "fee_item_insert" on public.fee_item for insert to authenticated
  with check (
    school_id = (select public.current_school_id())
    and (select public.has_perm('finance.write'))
  );
create policy "fee_item_update" on public.fee_item for update to authenticated
  using (
    school_id = (select public.current_school_id())
    and (select public.has_perm('finance.write'))
  )
  with check (
    school_id = (select public.current_school_id())
    and (select public.has_perm('finance.write'))
  );
create policy "fee_item_delete" on public.fee_item for delete to authenticated
  using (
    school_id = (select public.current_school_id())
    and (select public.has_perm('finance.write'))
  );

-- installment_schedule
create policy "installment_schedule_select" on public.installment_schedule for select to authenticated
  using (
    school_id = (select public.current_school_id())
    and (select public.has_perm('finance.read'))
  );
create policy "installment_schedule_insert" on public.installment_schedule for insert to authenticated
  with check (
    school_id = (select public.current_school_id())
    and (select public.has_perm('finance.write'))
  );
create policy "installment_schedule_update" on public.installment_schedule for update to authenticated
  using (
    school_id = (select public.current_school_id())
    and (select public.has_perm('finance.write'))
  )
  with check (
    school_id = (select public.current_school_id())
    and (select public.has_perm('finance.write'))
  );
create policy "installment_schedule_delete" on public.installment_schedule for delete to authenticated
  using (
    school_id = (select public.current_school_id())
    and (select public.has_perm('finance.write'))
  );

-- reminder_rule
create policy "reminder_rule_select" on public.reminder_rule for select to authenticated
  using (
    school_id = (select public.current_school_id())
    and (select public.has_perm('finance.read'))
  );
create policy "reminder_rule_insert" on public.reminder_rule for insert to authenticated
  with check (
    school_id = (select public.current_school_id())
    and (select public.has_perm('finance.write'))
  );
create policy "reminder_rule_update" on public.reminder_rule for update to authenticated
  using (
    school_id = (select public.current_school_id())
    and (select public.has_perm('finance.write'))
  )
  with check (
    school_id = (select public.current_school_id())
    and (select public.has_perm('finance.write'))
  );
create policy "reminder_rule_delete" on public.reminder_rule for delete to authenticated
  using (
    school_id = (select public.current_school_id())
    and (select public.has_perm('finance.write'))
  );

-- ── 7. Ledger and finance logs: read-only, finance.read ─────────────────────
-- Writes stay with the definer money functions (no write policy, as in Phase 1).
-- installment
create policy "installment_select" on public.installment for select to authenticated
  using (
    school_id = (select public.current_school_id())
    and (select public.has_perm('finance.read'))
  );

-- money_event
create policy "money_event_select" on public.money_event for select to authenticated
  using (
    school_id = (select public.current_school_id())
    and (select public.has_perm('finance.read'))
  );

-- payment_allocation
create policy "payment_allocation_select" on public.payment_allocation for select to authenticated
  using (
    school_id = (select public.current_school_id())
    and (select public.has_perm('finance.read'))
  );

-- receipt_counter
create policy "receipt_counter_select" on public.receipt_counter for select to authenticated
  using (
    school_id = (select public.current_school_id())
    and (select public.has_perm('finance.read'))
  );

-- discount
create policy "discount_select" on public.discount for select to authenticated
  using (
    school_id = (select public.current_school_id())
    and (select public.has_perm('finance.read'))
  );

-- audit_entry
create policy "audit_entry_select" on public.audit_entry for select to authenticated
  using (
    school_id = (select public.current_school_id())
    and (select public.has_perm('finance.read'))
  );

-- sms_message_log
create policy "sms_message_log_select" on public.sms_message_log for select to authenticated
  using (
    school_id = (select public.current_school_id())
    and (select public.has_perm('finance.read'))
  );

-- sms_credit_topup
create policy "sms_credit_topup_select" on public.sms_credit_topup for select to authenticated
  using (
    school_id = (select public.current_school_id())
    and (select public.has_perm('finance.read'))
  );

-- sms_credit_consumption
create policy "sms_credit_consumption_select" on public.sms_credit_consumption for select to authenticated
  using (
    school_id = (select public.current_school_id())
    and (select public.has_perm('finance.read'))
  );

create policy "sms_credit_topup_superadmin_all" on public.sms_credit_topup for all to authenticated
  using ((select public.current_is_super_admin()))
  with check ((select public.current_is_super_admin()));

-- ── 8. notification: own rows; money types also need finance.read ──────────
create policy "notification_select" on public.notification for select to authenticated
  using (
    school_id = (select public.current_school_id())
    and user_id = (select auth.uid())
    and (type not in ('payment_recorded', 'low_sms_credit') or (select public.has_perm('finance.read')))
  );
create policy "notification_mark_read" on public.notification for update to authenticated
  using (
    school_id = (select public.current_school_id())
    and user_id = (select auth.uid())
  )
  with check (
    school_id = (select public.current_school_id())
    and user_id = (select auth.uid())
  );

-- ── 9. user: own row, users.read for the school, super-admin directory ──────
create policy "user_self_select" on public.user for select to authenticated
  using (id = (select auth.uid()));
create policy "user_school_read" on public.user for select to authenticated
  using (
    school_id = (select public.current_school_id())
    and (select public.has_perm('users.read'))
  );
-- Unchanged meaning (FR-024); user_guard_direct_changes (0034/0037a) still applies.
create policy "user_superadmin_all" on public.user for all to authenticated
  using ((select public.current_is_super_admin()))
  with check ((select public.current_is_super_admin()));

-- ── 10. Storage (T029): path school check copied from 0014 / 0027 ───────────
drop policy if exists "money_attachments_tenant_rw" on storage.objects;
drop policy if exists "school_logos_admin_write" on storage.objects;

create policy "money_attachments_select" on storage.objects for select to authenticated
  using (
    bucket_id = 'money-attachments'
    and (storage.foldername(name))[1] = (select public.current_school_id())::text
    and (select public.has_perm('finance.read'))
  );
create policy "money_attachments_insert" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'money-attachments'
    and (storage.foldername(name))[1] = (select public.current_school_id())::text
    and (select public.has_perm('finance.write'))
  );
create policy "money_attachments_update" on storage.objects for update to authenticated
  using (
    bucket_id = 'money-attachments'
    and (storage.foldername(name))[1] = (select public.current_school_id())::text
    and (select public.has_perm('finance.write'))
  )
  with check (
    bucket_id = 'money-attachments'
    and (storage.foldername(name))[1] = (select public.current_school_id())::text
    and (select public.has_perm('finance.write'))
  );
create policy "money_attachments_delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'money-attachments'
    and (storage.foldername(name))[1] = (select public.current_school_id())::text
    and (select public.has_perm('finance.write'))
  );

-- school-logos: reads stay as they are (public bucket); writes need settings.manage.
create policy "school_logos_settings_write" on storage.objects for all to authenticated
  using (
    bucket_id = 'school-logos'
    and (storage.foldername(name))[1] = (select public.current_school_id())::text
    and (select public.has_perm('settings.manage'))
  )
  with check (
    bucket_id = 'school-logos'
    and (storage.foldername(name))[1] = (select public.current_school_id())::text
    and (select public.has_perm('settings.manage'))
  );

-- GRANTs are unchanged: a GRANT is only the coarse gate; the policies above decide.

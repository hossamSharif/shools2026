-- ============================================================================
-- test_gauntlet_data.sql
-- Seed data for running The Gauntlet (G1/G2/G3/G5) against a live Supabase
-- project. NOT applied via apply_migration (this is test data, not schema).
-- Run via Supabase MCP execute_sql, in the order of the sections below.
--
-- Creates:
--   - 2 schools ("Gauntlet School A", "Gauntlet School B") with subscriptions
--   - auth.users + auth.identities + public.user rows for:
--       super_admin (school-less)
--       school_admin / accountant / viewer for School A
--       school_admin for School B (cross-tenant isolation check)
--   - School A spine: academic year, sections, 2 accounts (cash+bank), fee
--     structure (2 grades) with installment schedules, 12 students, enrollments
--     (installments generated via generate_installments() trigger)
--   - A handful of real money events posted via RPC (apply_fee_payment,
--     record_expense, record_transfer, record_refund, apply_discount)
--
-- All passwords: password123 (crypt/bf via pgcrypto, Supabase's standard
-- raw-SQL auth-user seeding pattern).
-- ============================================================================

-- ── Schools + subscriptions ─────────────────────────────────────────────────
insert into public.school (id, name) values
  ('a0000000-0000-0000-0000-00000000000a', 'Gauntlet School A'),
  ('b0000000-0000-0000-0000-00000000000b', 'Gauntlet School B')
on conflict (id) do nothing;

insert into public.subscription (school_id, period_start, period_end, grace_days) values
  ('a0000000-0000-0000-0000-00000000000a', current_date - interval '30 days', current_date + interval '335 days', 14),
  ('b0000000-0000-0000-0000-00000000000b', current_date - interval '30 days', current_date + interval '335 days', 14)
on conflict do nothing;

-- ── Auth users (auth.users + auth.identities) ───────────────────────────────
-- uids fixed for reproducibility.
do $$
declare
  v_users jsonb := '[
    {"id":"11111111-1111-1111-1111-111111111111","email":"superadmin@gauntlet.test","role":"super_admin","school":null,"name":"Super Admin"},
    {"id":"22222222-2222-2222-2222-222222222222","email":"admin.a@gauntlet.test","role":"school_admin","school":"a0000000-0000-0000-0000-00000000000a","name":"School A Admin"},
    {"id":"33333333-3333-3333-3333-333333333333","email":"accountant.a@gauntlet.test","role":"accountant","school":"a0000000-0000-0000-0000-00000000000a","name":"School A Accountant"},
    {"id":"44444444-4444-4444-4444-444444444444","email":"viewer.a@gauntlet.test","role":"viewer","school":"a0000000-0000-0000-0000-00000000000a","name":"School A Viewer"},
    {"id":"55555555-5555-5555-5555-555555555555","email":"admin.b@gauntlet.test","role":"school_admin","school":"b0000000-0000-0000-0000-00000000000b","name":"School B Admin"}
  ]'::jsonb;
  v_rec jsonb;
begin
  for v_rec in select * from jsonb_array_elements(v_users) loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, recovery_sent_at, last_sign_in_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000',
      (v_rec->>'id')::uuid,
      'authenticated', 'authenticated',
      v_rec->>'email',
      crypt('password123', gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}', '{}',
      now(), now(), '', '', '', ''
    )
    on conflict (id) do nothing;

    insert into auth.identities (
      id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), (v_rec->>'id')::uuid, (v_rec->>'id')::uuid,
      jsonb_build_object('sub', v_rec->>'id', 'email', v_rec->>'email'),
      'email', now(), now(), now()
    )
    on conflict (provider, provider_id) do nothing;

    insert into public.user (id, role, school_id, display_name)
    values (
      (v_rec->>'id')::uuid,
      (v_rec->>'role')::public.user_role,
      nullif(v_rec->>'school', '')::uuid,
      v_rec->>'name'
    )
    on conflict (id) do nothing;
  end loop;
end $$;

-- ── School A spine ───────────────────────────────────────────────────────────
insert into public.academic_year (id, school_id, label, is_current) values
  ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', '2025/2026', true)
on conflict (id) do nothing;

-- Sections under grade "primary_1" and "primary_2" (assumes grade.code seeded).
insert into public.section (id, school_id, grade_id, name)
select 'a2000000-0000-0000-0000-00000000000' || row_number() over ()::text,
       'a0000000-0000-0000-0000-00000000000a', g.id, 'شعبة أ'
from public.grade g where g.code in ('p1', 'p2')
on conflict (id) do nothing;

-- Accounts.
insert into public.account (id, school_id, name, type, account_number, opening_balance) values
  ('a3000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'الخزينة الرئيسية', 'cash', null, 50000.00),
  ('a3000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-00000000000a', 'حساب بنكي - بنك الخرطوم', 'bank', '1234567890', 200000.00)
on conflict (id) do nothing;

-- Fee structure for primary_1, current year.
insert into public.fee_structure (id, school_id, grade_id, academic_year_id)
select 'a4000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', g.id,
       'a1000000-0000-0000-0000-000000000001'
from public.grade g where g.code = 'p1'
on conflict (id) do nothing;

insert into public.fee_item (school_id, fee_structure_id, name, amount) values
  ('a0000000-0000-0000-0000-00000000000a', 'a4000000-0000-0000-0000-000000000001', 'رسوم دراسية', 8000.00),
  ('a0000000-0000-0000-0000-00000000000a', 'a4000000-0000-0000-0000-000000000001', 'نقل', 1500.00)
on conflict do nothing;

insert into public.installment_schedule (school_id, fee_structure_id, sequence, due_date, amount) values
  ('a0000000-0000-0000-0000-00000000000a', 'a4000000-0000-0000-0000-000000000001', 1, current_date - interval '60 days', 3166.67),
  ('a0000000-0000-0000-0000-00000000000a', 'a4000000-0000-0000-0000-000000000001', 2, current_date + interval '30 days', 3166.67),
  ('a0000000-0000-0000-0000-00000000000a', 'a4000000-0000-0000-0000-000000000001', 3, current_date + interval '120 days', 3166.66)
on conflict do nothing;

-- 12 students + enrollments (installments auto-generated by trigger).
do $$
declare
  v_grade_id uuid;
  v_section_id uuid;
  i int;
  v_student_id uuid;
begin
  select id into v_grade_id from public.grade where code = 'p1';
  select id into v_section_id from public.section
   where school_id = 'a0000000-0000-0000-0000-00000000000a' and grade_id = v_grade_id limit 1;

  for i in 1..12 loop
    v_student_id := ('a5000000-0000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid;
    insert into public.student (id, school_id, name, guardian_name, guardian_phone, status)
    values (v_student_id, 'a0000000-0000-0000-0000-00000000000a',
            'طالب اختبار ' || i, 'ولي أمر ' || i, '+2499000000' || lpad(i::text, 2, '0'), 'active')
    on conflict (id) do nothing;

    insert into public.enrollment (school_id, student_id, grade_id, section_id, academic_year_id)
    values ('a0000000-0000-0000-0000-00000000000a', v_student_id, v_grade_id, v_section_id,
            'a1000000-0000-0000-0000-000000000001')
    on conflict (school_id, student_id, academic_year_id) do nothing;
  end loop;
end $$;

-- ============================================================================
-- Additions for the US5/US7/US8 E2E gap-closing session (T094/T111/T126):
--   - 3 extra schools pinned to fixed lifecycle states (grace/locked/no-credit)
--     each with one seeded accountant + one student + 2 accounts, so US8's
--     read/export routes and mutate-route rejection assertions have real data.
--   - Default reminder_rule rows for schools A/B/C/D/E — migration 0017 seeds
--     defaults only for schools that already existed at migration time, and
--     these schools (including A) were created afterwards.
--   - A few varied-status sms_message_log rows for School A (US7 log view).
--   - An SMS credit topup for School A (bypasses topup_sms_credit's
--     super-admin RPC check, which requires a real JWT claim not available
--     from a raw SQL session — inserted directly into sms_credit_topup,
--     which is exactly what that RPC does internally).
-- ============================================================================

insert into public.school (id, name) values
  ('c0000000-0000-0000-0000-00000000000c', 'Gauntlet School C (Grace)'),
  ('d0000000-0000-0000-0000-00000000000d', 'Gauntlet School D (Locked)'),
  ('e0000000-0000-0000-0000-00000000000e', 'Gauntlet School E (No Credit)')
on conflict (id) do nothing;

insert into public.subscription (school_id, period_start, period_end, grace_days) values
  ('c0000000-0000-0000-0000-00000000000c', current_date - interval '400 days', current_date - interval '1 day', 14),
  ('d0000000-0000-0000-0000-00000000000d', current_date - interval '400 days', current_date - interval '40 days', 14),
  ('e0000000-0000-0000-0000-00000000000e', current_date - interval '30 days', current_date + interval '335 days', 14)
on conflict do nothing;

do $$
declare
  v_users jsonb := '[
    {"id":"66666666-6666-6666-6666-666666666666","email":"accountant.grace@gauntlet.test","role":"accountant","school":"c0000000-0000-0000-0000-00000000000c","name":"Grace Accountant"},
    {"id":"77777777-7777-7777-7777-777777777777","email":"accountant.locked@gauntlet.test","role":"accountant","school":"d0000000-0000-0000-0000-00000000000d","name":"Locked Accountant"},
    {"id":"88888888-8888-8888-8888-888888888888","email":"accountant.e@gauntlet.test","role":"accountant","school":"e0000000-0000-0000-0000-00000000000e","name":"No-Credit Accountant"}
  ]'::jsonb;
  v_rec jsonb;
begin
  for v_rec in select * from jsonb_array_elements(v_users) loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, recovery_sent_at, last_sign_in_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000',
      (v_rec->>'id')::uuid,
      'authenticated', 'authenticated',
      v_rec->>'email',
      crypt('password123', gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}', '{}',
      now(), now(), '', '', '', ''
    )
    on conflict (id) do nothing;

    insert into auth.identities (
      id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), (v_rec->>'id')::uuid, (v_rec->>'id')::uuid,
      jsonb_build_object('sub', v_rec->>'id', 'email', v_rec->>'email'),
      'email', now(), now(), now()
    )
    on conflict (provider, provider_id) do nothing;

    insert into public.user (id, role, school_id, display_name)
    values (
      (v_rec->>'id')::uuid,
      (v_rec->>'role')::public.user_role,
      nullif(v_rec->>'school', '')::uuid,
      v_rec->>'name'
    )
    on conflict (id) do nothing;
  end loop;
end $$;

insert into public.academic_year (id, school_id, label, is_current) values
  ('c1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000c', '2025/2026', true),
  ('d1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-00000000000d', '2025/2026', true),
  ('e1000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-00000000000e', '2025/2026', true)
on conflict (id) do nothing;

insert into public.student (id, school_id, name, guardian_name, guardian_phone, status) values
  ('c5000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000c', 'طالب سي', 'ولي أمر سي', '+249900000101', 'active'),
  ('d5000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-00000000000d', 'طالب دي', 'ولي أمر دي', '+249900000102', 'active'),
  ('e5000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-00000000000e', 'طالب إي', 'ولي أمر إي', '+249900000103', 'active')
on conflict (id) do nothing;

insert into public.account (id, school_id, name, type, account_number, opening_balance) values
  ('c3000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000c', 'الخزينة', 'cash', null, 10000.00),
  ('c3000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-00000000000c', 'حساب بنكي', 'bank', '111', 20000.00),
  ('d3000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-00000000000d', 'الخزينة', 'cash', null, 10000.00),
  ('d3000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-00000000000d', 'حساب بنكي', 'bank', '222', 20000.00)
on conflict (id) do nothing;

-- Default reminder rules for schools A/B/C/D/E (0017's migration-time seed
-- only covers schools that existed when that migration ran).
insert into public.reminder_rule (school_id, offset_kind, days, enabled)
select s.id, r.offset_kind, r.days, true
  from public.school s
  cross join (values ('before', 3), ('on', 0), ('after', 3)) as r(offset_kind, days)
 where s.id in (
   'a0000000-0000-0000-0000-00000000000a', 'b0000000-0000-0000-0000-00000000000b',
   'c0000000-0000-0000-0000-00000000000c', 'd0000000-0000-0000-0000-00000000000d',
   'e0000000-0000-0000-0000-00000000000e')
on conflict do nothing;

-- Varied-status SMS log rows for School A (US7 log-view spec).
insert into public.sms_message_log (school_id, student_id, recipient_phone, message_text, segments, status, is_manual, idempotency_key, created_at)
values
  ('a0000000-0000-0000-0000-00000000000a','a5000000-0000-0000-0000-000000000001','+2499000000001','تذكير: يرجى سداد القسط المستحق.',1,'queued',false, gen_random_uuid(), now() - interval '3 hours'),
  ('a0000000-0000-0000-0000-00000000000a','a5000000-0000-0000-0000-000000000001','+2499000000001','تذكير: يرجى سداد القسط المستحق.',1,'delivered',false, gen_random_uuid(), now() - interval '2 hours'),
  ('a0000000-0000-0000-0000-00000000000a','a5000000-0000-0000-0000-000000000002','+2499000000002','تذكير: يرجى سداد القسط المستحق.',1,'failed',false, gen_random_uuid(), now() - interval '1 hour')
on conflict do nothing;

-- SMS credit for School A (equivalent to what topup_sms_credit's RPC does,
-- inserted directly since the RPC requires a real super-admin JWT claim).
insert into public.sms_credit_topup (school_id, amount, actor_user_id, idempotency_key)
select 'a0000000-0000-0000-0000-00000000000a', 1000, '11111111-1111-1111-1111-111111111111', gen_random_uuid()
where not exists (
  select 1 from public.sms_credit_topup where school_id = 'a0000000-0000-0000-0000-00000000000a'
);
-- School E deliberately gets NO topup (used for the INSUFFICIENT_CREDIT spec).

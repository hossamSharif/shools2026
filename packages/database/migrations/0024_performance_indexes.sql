-- 0024_performance_indexes.sql
-- Phase 12 (T135): performance budgets at ~2,000 students — dashboard,
-- receivables, statement <=3s; PDF export <=5s.
--
-- NOTE: tasks.md originally named this "0021_performance_indexes.sql", but
-- 0021-0023 were already taken by the student_statement / receivables_aging /
-- dashboard_kpis function migrations. Renumbered to 0024 (next free slot).
--
-- Rationale: get_advisors (performance) flagged unindexed FKs on the
-- money-critical tables that back dashboard_kpis, receivables_aging, and
-- student_statement query paths. money_event(school_id, account_id,
-- occurred_at) and installment(school_id, due_date) already exist from
-- migrations 0010/0011 — verified via list_tables/execute_sql before adding
-- these, no duplicates below.

-- money_event: account_id/from_account_id/to_account_id/student_id are
-- already covered as leading columns of existing composite indexes
-- (money_event_account_idx, money_event_from_account_idx,
-- money_event_to_account_idx, money_event_student_idx — verified via
-- pg_indexes before writing this migration). Only actor_user_id and the
-- reversal chain lack any covering index.
create index if not exists money_event_actor_user_id_idx on public.money_event (actor_user_id);
create index if not exists money_event_reverses_event_id_idx on public.money_event (reverses_event_id);

-- installment: (school_id, student_id) already covers student lookups
-- (installment_student_idx, verified via pg_indexes) — no new index needed.

-- payment_allocation: statement/receipt joins to installment.
create index if not exists payment_allocation_installment_id_idx on public.payment_allocation (installment_id);

-- discount: statement joins.
create index if not exists discount_student_id_idx on public.discount (student_id);
create index if not exists discount_installment_id_idx on public.discount (installment_id);
create index if not exists discount_actor_user_id_idx on public.discount (actor_user_id);

-- audit_entry: audit trail lookups by actor.
create index if not exists audit_entry_actor_user_id_idx on public.audit_entry (actor_user_id);

-- enrollment: spine joins used by receivables (stage/grade/section filters).
create index if not exists enrollment_student_id_idx on public.enrollment (student_id);
create index if not exists enrollment_grade_id_idx on public.enrollment (grade_id);
create index if not exists enrollment_section_id_idx on public.enrollment (section_id);
create index if not exists enrollment_academic_year_id_idx on public.enrollment (academic_year_id);

-- sms_message_log: per-student sms log lookups.
create index if not exists sms_message_log_student_id_idx on public.sms_message_log (student_id);

-- sms_credit_topup / consumption actor + message joins.
create index if not exists sms_credit_topup_actor_user_id_idx on public.sms_credit_topup (actor_user_id);
create index if not exists sms_credit_consumption_sms_message_id_idx on public.sms_credit_consumption (sms_message_id);

-- notification: bell UI per-user unread lookups (school_id, user_id already
-- indexed per migration 0020; this covers the raw FK).
create index if not exists notification_user_id_idx on public.notification (user_id);

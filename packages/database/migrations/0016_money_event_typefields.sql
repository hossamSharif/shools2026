-- ============================================================================
-- 0016_money_event_typefields (US4)
-- Adds type-specific columns to money_event: transfer (from/to accounts) and the
-- student linkage for refund/adjustment (FR-025/026/027).
-- MONEY-MIGRATION ⇒ OWNER REVIEW (Article XII).
-- ============================================================================

alter table public.money_event
  add column from_account_id uuid references public.account (id),
  add column to_account_id   uuid references public.account (id),
  add column student_id      uuid references public.student (id);

create index money_event_from_account_idx
  on public.money_event (school_id, from_account_id, occurred_at)
  where from_account_id is not null;
create index money_event_to_account_idx
  on public.money_event (school_id, to_account_id, occurred_at)
  where to_account_id is not null;
create index money_event_student_idx
  on public.money_event (school_id, student_id, occurred_at)
  where student_id is not null;

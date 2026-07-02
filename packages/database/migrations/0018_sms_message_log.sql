-- ============================================================================
-- 0018_sms_message_log
-- Append-only SMS dispatch log (US7). FINANCIAL/credit-adjacent (drives SMS
-- credit consumption) ⇒ MONEY-ADJACENT: OWNER REVIEW (Article XII). Super-admin
-- is walled off (Article IV) — no super-admin policy is granted here.
-- ============================================================================

create table public.sms_message_log (
  id                 uuid primary key default gen_random_uuid(),
  school_id          uuid not null references public.school (id) on delete cascade,
  student_id         uuid not null references public.student (id) on delete cascade,
  recipient_phone    text not null,
  message_text       text not null,
  segments           int  not null check (segments > 0),
  status             text not null default 'queued'
                        check (status in ('queued', 'sent', 'delivered', 'failed')),
  provider_message_id text,
  is_manual          boolean not null default false,
  idempotency_key    uuid not null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint sms_message_log_idem unique (school_id, idempotency_key)
);

create index sms_message_log_school_student_created_idx
  on public.sms_message_log (school_id, student_id, created_at);

create index sms_message_log_provider_message_id_idx
  on public.sms_message_log (provider_message_id)
  where provider_message_id is not null;

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.sms_message_log enable row level security;
alter table public.sms_message_log force row level security;

-- Tenant reads own log rows only. Writes go through SECURITY DEFINER functions
-- (dispatch/manual send + delivery webhook) — no direct tenant write policy.
create policy "sms_message_log_tenant_read"
  on public.sms_message_log for select to authenticated
  using (school_id = public.current_school_id());

grant select on public.sms_message_log to authenticated;

-- Link sms_credit_consumption.sms_message_id → sms_message_log for traceability.
alter table public.sms_credit_consumption
  add constraint sms_credit_consumption_sms_message_id_fkey
  foreign key (sms_message_id) references public.sms_message_log (id);

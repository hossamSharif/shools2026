-- ============================================================================
-- 0043_invitation_access_audit (spec 002, data-model §7–§8, tasks T050).
-- New tenant tables with RLS ⇒ OWNER REVIEW before apply (Article XII).
--
-- * invitation: 7-day, single-use, revocable staff invitations (FR-026). The
--   raw token is never stored; token_hash is SHA-256 of it and is not
--   selectable by authenticated (column grants exclude it).
-- * access_audit_entry: immutable log of every access change (FR-031–FR-033).
--   No update/delete grant to anyone, plus a trigger that refuses UPDATE and
--   DELETE for every role including service_role (AUDIT_IMMUTABLE). Rows are
--   written only by the definer functions of 0044 through write_access_audit,
--   in the same transaction as the change they describe.
-- Neither table has a super-admin policy: the super-admin reads nothing (FR-024).
-- Supabase keeps pgcrypto and citext in the `extensions` schema; they are
-- referenced schema-qualified.
-- ============================================================================

create extension if not exists citext with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- ── invitation ──────────────────────────────────────────────────────────────
create table public.invitation (
  id           uuid primary key default gen_random_uuid(),
  school_id    uuid not null references public.school (id) on delete cascade,
  email        extensions.citext not null,
  roles        public.user_role[] not null,
  stage_scope  jsonb not null default '{}'::jsonb,
  state        public.invitation_state not null default 'pending',
  token_hash   bytea,
  invited_by   uuid not null references public.user (id),
  auth_user_id uuid,
  expires_at   timestamptz not null default (now() + interval '7 days'),
  accepted_at  timestamptz,
  revoked_at   timestamptz,
  revoked_by   uuid references public.user (id) on delete set null,
  created_at   timestamptz not null default now(),
  constraint invitation_staff_roles_only check (
    cardinality(roles) > 0
    and roles <@ array['school_admin', 'principal', 'student_affairs',
                       'teacher', 'accountant', 'viewer']::public.user_role[]),
  constraint invitation_stage_scope_object check (jsonb_typeof(stage_scope) = 'object')
);

create unique index invitation_one_pending_per_email
  on public.invitation (school_id, email) where state = 'pending';
create index invitation_school_state_idx on public.invitation (school_id, state);
create unique index invitation_token_hash_idx on public.invitation (token_hash) where token_hash is not null;
create index invitation_invited_by_idx on public.invitation (invited_by);

comment on table public.invitation is
  'Staff invitations: 7-day expiry, single use, revocable (FR-026). token_hash = SHA-256 of the raw token; never selectable.';

-- ── access_audit_entry ──────────────────────────────────────────────────────
create table public.access_audit_entry (
  id             bigint generated always as identity primary key,
  school_id      uuid not null references public.school (id) on delete cascade,
  actor_id       uuid references public.user (id) on delete set null,
  target_user_id uuid references public.user (id) on delete set null,
  target_email   extensions.citext,
  action         public.access_audit_action not null,
  before         jsonb not null default '{}'::jsonb,
  after          jsonb not null default '{}'::jsonb,
  occurred_at    timestamptz not null default now()
);

create index access_audit_school_time_idx on public.access_audit_entry (school_id, occurred_at desc);
create index access_audit_school_target_idx on public.access_audit_entry (school_id, target_user_id);
create index access_audit_school_action_idx on public.access_audit_entry (school_id, action);

comment on table public.access_audit_entry is
  'Immutable access-change log (FR-031–FR-033): one row per logical change, written in the same transaction.';

-- Immutability for every role, service_role included (FR-032, SC-007). Only
-- two foreign-key cascades get through, both from nested (FK) trigger levels:
--   * ON DELETE SET NULL of actor_id / target_user_id when a user is removed
--     (the history stays readable);
--   * ON DELETE CASCADE when the whole school is deleted.
create or replace function public.trg_access_audit_immutable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if pg_trigger_depth() > 1 then
    if tg_op = 'DELETE'
       and not exists (select 1 from public.school s where s.id = old.school_id) then
      return old;  -- school deleted: FK cascade
    end if;
    if tg_op = 'UPDATE'
       and new.id = old.id and new.school_id = old.school_id and new.action = old.action
       and new.before = old.before and new.after = old.after and new.occurred_at = old.occurred_at
       and new.target_email is not distinct from old.target_email
       and (new.actor_id is not distinct from old.actor_id or new.actor_id is null)
       and (new.target_user_id is not distinct from old.target_user_id or new.target_user_id is null) then
      return new;  -- user deleted: FK ON DELETE SET NULL
    end if;
  end if;
  raise exception 'AUDIT_IMMUTABLE' using
    errcode = 'P0001',
    hint = 'سجل الصلاحيات غير قابل للتعديل أو الحذف.';
end;
$$;

revoke execute on function public.trg_access_audit_immutable() from public, anon, authenticated;

create trigger access_audit_entry_immutable
  before update or delete on public.access_audit_entry
  for each row execute function public.trg_access_audit_immutable();

-- ── Internal writer (definer functions of 0044 only) ────────────────────────
create or replace function public.write_access_audit(
  p_school_id    uuid,
  p_actor        uuid,
  p_target       uuid,
  p_target_email text,
  p_action       public.access_audit_action,
  p_before       jsonb,
  p_after        jsonb
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.access_audit_entry
    (school_id, actor_id, target_user_id, target_email, action, before, after)
  values
    (p_school_id, p_actor, p_target, p_target_email, p_action,
     coalesce(p_before, '{}'::jsonb), coalesce(p_after, '{}'::jsonb));
$$;

comment on function public.write_access_audit(uuid, uuid, uuid, text, public.access_audit_action, jsonb, jsonb) is
  'Internal: appends one access_audit_entry row. Not executable by any client role.';

revoke execute on function public.write_access_audit(uuid, uuid, uuid, text, public.access_audit_action, jsonb, jsonb)
  from public, anon, authenticated, service_role;

-- ── RLS (Article IV checklist) ──────────────────────────────────────────────
alter table public.invitation enable row level security;
alter table public.invitation force row level security;
alter table public.access_audit_entry enable row level security;
alter table public.access_audit_entry force row level security;

create policy "invitation_users_read" on public.invitation for select to authenticated
  using (
    school_id = (select public.current_school_id())
    and (select public.has_perm('users.read'))
  );

create policy "access_audit_entry_users_read" on public.access_audit_entry for select to authenticated
  using (
    school_id = (select public.current_school_id())
    and (select public.has_perm('users.read'))
  );

-- Grants: read only, and never token_hash. No write grant to anyone.
revoke all on table public.invitation from anon, authenticated;
revoke all on table public.access_audit_entry from anon, authenticated;
grant select (id, school_id, email, roles, stage_scope, state, invited_by, auth_user_id,
              expires_at, accepted_at, revoked_at, revoked_by, created_at)
  on public.invitation to authenticated;
grant select on table public.access_audit_entry to authenticated;
-- service_role keeps its default privileges on purpose: an UPDATE/DELETE from the
-- worker or a fixture must reach the trigger and fail with AUDIT_IMMUTABLE.

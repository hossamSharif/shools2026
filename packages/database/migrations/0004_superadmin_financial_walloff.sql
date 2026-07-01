-- ============================================================================
-- 0004_superadmin_financial_walloff
-- Guarantees the super-admin is walled off from every school FINANCIAL table
-- (Article IV; SC-012; FR-002). MONEY-MIGRATION ⇒ OWNER REVIEW (Article XII).
--
-- Mechanism: financial tables run FORCE ROW LEVEL SECURITY with default-deny and
-- NO policy that grants the super-admin (who holds no school_id). This migration
-- (a) reaffirms FORCE RLS on the financial tables that exist so far and
-- (b) provides current_is_super_admin() so future financial-table migrations can
-- assert they never grant it. G5 verifies zero cross-tenant/super-admin reads.
-- ============================================================================

create or replace function public.current_is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_role() = 'super_admin', false);
$$;

comment on function public.current_is_super_admin() is
  'True when the caller is the super-admin. Financial-table RLS must NEVER grant on this.';

grant execute on function public.current_is_super_admin() to authenticated;

-- Reaffirm default-deny + FORCE on financial tables present at this phase. The
-- super-admin has no permissive policy here, so reads/writes return zero rows.
alter table public.sms_credit_consumption enable row level security;
alter table public.sms_credit_consumption force row level security;

-- Registry (documentation): financial tables added in later phases —
-- money_event, installment, payment_allocation, receipt_counter, audit_entry,
-- discount, sms_message_log — must follow the same rule: no super-admin policy.

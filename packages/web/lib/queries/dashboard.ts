import { createSupabaseServerClient } from '../supabase/server.js';

/**
 * Admin dashboard KPI read query (US6, T104). All figures are computed by
 * `dashboard_kpis` (DB function, Africa/Khartoum) — thin wrapper only
 * (Article VI/II).
 *
 * Spec 002 (T067): a caller with `finance.totals` but not `finance.read`
 * (the principal) receives only the five totals; the per-account, expense,
 * cash-flow and SMS fields are absent from the payload, decided by Postgres.
 */

export interface DashboardAccount {
  account_id: string;
  name: string;
  type: 'cash' | 'bank';
  balance: string;
}

/** The subset every `finance.totals` holder receives. */
export interface DashboardTotals {
  collected_month: string;
  collected_year: string;
  outstanding: string;
  collection_rate: string;
  overdue_count: number;
}

/** The full bundle returned to `finance.read` holders. */
export interface DashboardKpis extends DashboardTotals {
  accounts: DashboardAccount[];
  combined_balance: string;
  expenses_month: string;
  net_cash_flow_month: string;
  sms_credit_remaining: number;
}

/** What the RPC may return: the totals, with the finance-detail fields optional. */
export type DashboardPayload = DashboardTotals &
  Partial<Omit<DashboardKpis, keyof DashboardTotals>>;

/** True when the payload carries the finance-detail fields. */
export function isFullDashboard(k: DashboardPayload): k is DashboardKpis {
  return (
    Array.isArray(k.accounts) &&
    k.combined_balance != null &&
    k.expenses_month != null &&
    k.net_cash_flow_month != null &&
    k.sms_credit_remaining != null
  );
}

export async function dashboardKpis(schoolId: string): Promise<DashboardPayload> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.rpc('dashboard_kpis', { p_school_id: schoolId });
  if (error) throw new Error(error.message);
  return data as unknown as DashboardPayload;
}

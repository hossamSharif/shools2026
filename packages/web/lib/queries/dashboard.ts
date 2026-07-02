import { createSupabaseServerClient } from '../supabase/server.js';

/**
 * Admin dashboard KPI read query (US6, T104). All figures are computed by
 * `dashboard_kpis` (DB function, Africa/Khartoum) — thin wrapper only
 * (Article VI/II).
 */

export interface DashboardAccount {
  account_id: string;
  name: string;
  type: 'cash' | 'bank';
  balance: string;
}

export interface DashboardKpis {
  accounts: DashboardAccount[];
  combined_balance: string;
  collected_month: string;
  collected_year: string;
  outstanding: string;
  collection_rate: string;
  expenses_month: string;
  net_cash_flow_month: string;
  overdue_count: number;
  sms_credit_remaining: number;
}

export async function dashboardKpis(schoolId: string): Promise<DashboardKpis> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.rpc('dashboard_kpis', { p_school_id: schoolId });
  if (error) throw new Error(error.message);
  return data as unknown as DashboardKpis;
}

import { createSupabaseServerClient } from '../supabase/server.js';

/**
 * Student statement read query (US5, T096). Balances/entries are computed by
 * `student_statement` (DB function) — this is a thin wrapper, no money math
 * in JS (Article VI/II).
 */

export interface StatementEntry {
  entry_date: string;
  entry_type: 'charge' | 'payment' | 'discount' | 'adjustment' | 'refund';
  description: string;
  charge: string;
  credit: string;
  running_balance: string;
}

export async function studentStatement(studentId: string): Promise<StatementEntry[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.rpc('student_statement', { p_student_id: studentId });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as StatementEntry[];
}

export function totalOwed(entries: StatementEntry[]): string {
  if (entries.length === 0) return '0';
  return entries[entries.length - 1]!.running_balance;
}

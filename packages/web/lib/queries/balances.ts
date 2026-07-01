import { createSupabaseServerClient } from '../supabase/server.js';

/**
 * Derived-balance read queries (US3). Balances are computed by the DB functions
 * (Article II) — these thin wrappers never do money math in JS (Article VI).
 */

export async function accountBalance(accountId: string): Promise<string> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.rpc('account_balance', { p_account_id: accountId });
  if (error) throw new Error(error.message);
  return String(data ?? '0');
}

export async function studentBalance(studentId: string): Promise<string> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.rpc('student_balance', { p_student_id: studentId });
  if (error) throw new Error(error.message);
  return String(data ?? '0');
}

export async function installmentRunningBalance(installmentId: string): Promise<string> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.rpc('installment_running_balance', {
    p_installment_id: installmentId,
  });
  if (error) throw new Error(error.message);
  return String(data ?? '0');
}

export interface OutstandingInstallment {
  id: string;
  sequence: number;
  due_date: string;
  amount_charged: number;
  running_balance: string;
}

/** Student's installments with their running balances (for the payment form). */
export async function studentInstallments(studentId: string): Promise<OutstandingInstallment[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from('installment')
    .select('id, sequence, due_date, amount_charged')
    .eq('student_id', studentId)
    .order('due_date', { ascending: true })
    .order('sequence', { ascending: true });
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  const withBalances = await Promise.all(
    rows.map(async (r) => ({
      ...r,
      running_balance: await installmentRunningBalance(r.id),
    })),
  );
  return withBalances;
}

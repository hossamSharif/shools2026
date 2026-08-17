import { createSupabaseServerClient } from '../supabase/server.js';

/**
 * Read queries for the payments and expenses list sections.
 *
 * These are plain table reads over the append-only `money_event` log — RLS
 * scopes them to the caller's school — not money math. Every amount is passed
 * through as the decimal string Postgres produced (Article I/VI); nothing here
 * derives or aggregates a balance.
 */

export interface PaymentListRow {
  id: string;
  receipt_no: number | null;
  occurred_at: string;
  amount: string;
  notes: string | null;
  reverses_event_id: string | null;
  student: { id: string; name: string } | null;
  account: { id: string; name: string } | null;
}

export interface PaymentListFilters {
  q?: string;
  accountId?: string;
  from?: string;
  to?: string;
}

export async function listPayments(
  schoolId: string,
  f: PaymentListFilters = {},
): Promise<PaymentListRow[]> {
  const supabase = createSupabaseServerClient();
  let query = supabase
    .from('money_event')
    .select(
      // `account` must be disambiguated: money_event has three FKs to account
      // (account_id, from_account_id, to_account_id), so a bare embed is
      // ambiguous and PostgREST rejects it (PGRST201).
      'id, receipt_no, occurred_at, amount, notes, reverses_event_id, student:student(id, name), account:account!money_event_account_id_fkey(id, name)',
    )
    .eq('school_id', schoolId)
    .eq('event_type', 'fee_payment')
    .order('occurred_at', { ascending: false })
    .limit(500);

  if (f.accountId) query = query.eq('account_id', f.accountId);
  if (f.from) query = query.gte('occurred_at', `${f.from}T00:00:00Z`);
  if (f.to) query = query.lte('occurred_at', `${f.to}T23:59:59Z`);

  const { data, error } = await query.returns<PaymentListRow[]>();
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  if (!f.q) return rows;

  // Receipt number or student name. Kept in JS rather than pushed into
  // PostgREST because an `or` across an embedded relation isn't expressible
  // there, and the result set is already capped at 500 rows.
  const needle = f.q.trim().toLowerCase();
  return rows.filter(
    (r) =>
      String(r.receipt_no ?? '').includes(needle) ||
      (r.student?.name ?? '').toLowerCase().includes(needle),
  );
}

export interface ExpenseListRow {
  id: string;
  occurred_at: string;
  amount: string;
  category: string | null;
  vendor: string | null;
  description: string | null;
  reverses_event_id: string | null;
  account: { id: string; name: string } | null;
}

export interface ExpenseListFilters {
  q?: string;
  accountId?: string;
  category?: string;
  from?: string;
  to?: string;
}

export async function listExpenses(
  schoolId: string,
  f: ExpenseListFilters = {},
): Promise<ExpenseListRow[]> {
  const supabase = createSupabaseServerClient();
  let query = supabase
    .from('money_event')
    .select(
      // Same disambiguation as listPayments — see note there.
      'id, occurred_at, amount, category, vendor, description, reverses_event_id, account:account!money_event_account_id_fkey(id, name)',
    )
    .eq('school_id', schoolId)
    .eq('event_type', 'expense')
    .order('occurred_at', { ascending: false })
    .limit(500);

  if (f.accountId) query = query.eq('account_id', f.accountId);
  if (f.category) query = query.eq('category', f.category);
  if (f.from) query = query.gte('occurred_at', `${f.from}T00:00:00Z`);
  if (f.to) query = query.lte('occurred_at', `${f.to}T23:59:59Z`);

  const { data, error } = await query.returns<ExpenseListRow[]>();
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  if (!f.q) return rows;

  const needle = f.q.trim().toLowerCase();
  return rows.filter((r) =>
    [r.category, r.vendor, r.description]
      .filter(Boolean)
      .some((v) => (v as string).toLowerCase().includes(needle)),
  );
}

/** Distinct expense categories for the category filter. */
export async function expenseCategories(schoolId: string): Promise<string[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from('money_event')
    .select('category')
    .eq('school_id', schoolId)
    .eq('event_type', 'expense')
    .not('category', 'is', null)
    .returns<{ category: string }[]>();
  if (error) throw new Error(error.message);
  return [...new Set((data ?? []).map((r) => r.category))].sort();
}

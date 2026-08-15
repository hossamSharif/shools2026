import { ReceiptText, CalendarDays, Filter, Hash } from 'lucide-react';
import { requireAuth } from '../../../lib/auth/guard.js';
import { createSupabaseServerClient } from '../../../lib/supabase/server.js';
import { listExpenses, expenseCategories } from '../../../lib/queries/money-events.js';
import { formatCurrency } from '../../../lib/format/currency.js';
import { SCHOOL_TZ } from '../../../lib/format/date.js';
import { PageHeader, SectionKpis, type SectionKpi } from '../../../components/layout/index.js';
import { ExpenseFormDialog } from '../../../components/money/expense-form-dialog.js';
import { ExpenseFilters } from '../../../components/money/expense-filters.js';
import { ExpensesTable } from '../../../components/money/expenses-table.js';

/**
 * Expenses list (design pass): header actions → KPI strip → filter rail →
 * table, matching the students section. `/expenses/new` remains a standalone
 * route; this page also offers the same form in a modal.
 */
export const dynamic = 'force-dynamic';

interface ExpensesSearchParams {
  q?: string;
  accountId?: string;
  category?: string;
  from?: string;
  to?: string;
}

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: ExpensesSearchParams;
}) {
  const ctx = await requireAuth();
  if (!ctx.schoolId) {
    return (
      <div dir="rtl">
        <p className="text-muted-foreground">لا توجد مدرسة مرتبطة بهذا الحساب.</p>
      </div>
    );
  }

  const supabase = createSupabaseServerClient();
  const [{ data: accounts }, categories, rows] = await Promise.all([
    supabase
      .from('account')
      .select('id, name, type')
      .order('name')
      .returns<{ id: string; name: string; type: 'cash' | 'bank' }[]>(),
    expenseCategories(ctx.schoolId),
    listExpenses(ctx.schoolId, searchParams),
  ]);

  // Display-only totals over the rows on screen; reversing entries excluded
  // from the sums but kept visible in the table.
  const live = rows.filter((r) => !r.reverses_event_id);
  const total = live.reduce((sum, r) => sum + Number(r.amount), 0);
  const monthPrefix = new Intl.DateTimeFormat('en-CA', { timeZone: SCHOOL_TZ })
    .format(new Date())
    .slice(0, 7);
  const monthTotal = live
    .filter((r) => r.occurred_at.slice(0, 7) === monthPrefix)
    .reduce((sum, r) => sum + Number(r.amount), 0);

  const kpis: SectionKpi[] = [
    {
      label: 'إجمالي المُصفّى',
      value: formatCurrency(total.toFixed(2)),
      icon: Filter,
      tone: 'primary',
    },
    {
      label: 'مصروفات هذا الشهر',
      value: formatCurrency(monthTotal.toFixed(2)),
      icon: CalendarDays,
      tone: 'danger',
    },
    { label: 'عدد العمليات', value: String(live.length), icon: Hash, tone: 'info' },
    {
      label: 'قيود عكسية',
      value: String(rows.length - live.length),
      icon: ReceiptText,
      tone: rows.length - live.length > 0 ? 'warning' : 'neutral',
    },
  ];

  const accountOptions = (accounts ?? []).map((a) => ({
    id: a.id,
    label: `${a.name} (${a.type === 'cash' ? 'نقدي' : 'بنكي'})`,
  }));

  return (
    <div dir="rtl" className="space-y-6">
      <PageHeader
        title="المصروفات"
        subtitle="سجل مصروفات المدرسة"
        actions={<ExpenseFormDialog accounts={accountOptions} />}
      />

      <SectionKpis items={kpis} />

      <ExpenseFilters
        accounts={accountOptions}
        categories={categories}
        values={searchParams as Record<string, string | undefined>}
      />

      <ExpensesTable data={rows} />
    </div>
  );
}

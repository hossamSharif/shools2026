import { Wallet, Receipt, CalendarDays, Filter } from 'lucide-react';
import { requireAuth } from '../../../lib/auth/guard.js';
import { createSupabaseServerClient } from '../../../lib/supabase/server.js';
import { listPayments } from '../../../lib/queries/money-events.js';
import { formatCurrency } from '../../../lib/format/currency.js';
import { SCHOOL_TZ } from '../../../lib/format/date.js';
import { PageHeader, SectionKpis, type SectionKpi } from '../../../components/layout/index.js';
import { PaymentFormDialog } from '../../../components/payments/payment-form-dialog.js';
import { PaymentFilters } from '../../../components/payments/payment-filters.js';
import { PaymentsTable } from '../../../components/payments/payments-table.js';

/**
 * Fee-payments list (design pass): header actions → KPI strip → filter rail →
 * table, matching the students section. `/payments/new` remains a standalone
 * route; this page also offers the same form in a modal.
 */
export const dynamic = 'force-dynamic';

interface PaymentsSearchParams {
  q?: string;
  accountId?: string;
  from?: string;
  to?: string;
}

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: PaymentsSearchParams;
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
  const [{ data: students }, { data: accounts }] = await Promise.all([
    supabase
      .from('student')
      .select('id, name')
      .eq('status', 'active')
      .order('name')
      .returns<{ id: string; name: string }[]>(),
    supabase
      .from('account')
      .select('id, name, type')
      .order('name')
      .returns<{ id: string; name: string; type: 'cash' | 'bank' }[]>(),
  ]);

  const rows = await listPayments(ctx.schoolId, searchParams);

  // Display-only totals over the rows already on screen. Reversing entries are
  // excluded from the sums but stay visible in the table.
  const live = rows.filter((r) => !r.reverses_event_id);
  const total = live.reduce((sum, r) => sum + Number(r.amount), 0);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: SCHOOL_TZ }).format(new Date());
  const todayTotal = live
    .filter((r) => r.occurred_at.slice(0, 10) === today)
    .reduce((sum, r) => sum + Number(r.amount), 0);

  const kpis: SectionKpi[] = [
    {
      label: 'إجمالي المُصفّى',
      value: formatCurrency(total.toFixed(2)),
      icon: Filter,
      tone: 'primary',
    },
    { label: 'عدد الدفعات', value: String(live.length), icon: Receipt, tone: 'info' },
    {
      label: 'محصّل اليوم',
      value: formatCurrency(todayTotal.toFixed(2)),
      icon: CalendarDays,
      tone: 'success',
    },
    {
      label: 'قيود عكسية',
      value: String(rows.length - live.length),
      icon: Wallet,
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
        title="المدفوعات"
        subtitle="سجل دفعات الرسوم والإيصالات"
        actions={
          <PaymentFormDialog
            students={(students ?? []).map((s) => ({ id: s.id, label: s.name }))}
            accounts={accountOptions.map((a) => ({ id: a.id, label: a.label }))}
          />
        }
      />

      <SectionKpis items={kpis} />

      <PaymentFilters
        accounts={accountOptions}
        values={searchParams as Record<string, string | undefined>}
      />

      <PaymentsTable data={rows} />
    </div>
  );
}

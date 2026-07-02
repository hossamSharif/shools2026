import { Card, CardContent } from '@erp/ui';
import { requireAuth } from '../../../lib/auth/guard.js';
import { dashboardKpis } from '../../../lib/queries/dashboard.js';
import { formatCurrency } from '../../../lib/format/currency.js';
import { CreditTile } from '../../../components/dashboard/credit-tile.js';

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="space-y-1 pt-6">
        <p className="text-sm text-gray-500">{label}</p>
        <p className="text-xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}

/** School admin dashboard (US6, T105). Fully derived KPI bundle, RTL. */
export default async function DashboardPage() {
  const ctx = await requireAuth();
  if (!ctx.schoolId) {
    return (
      <div dir="rtl">
        <p className="text-gray-500">لا توجد مدرسة مرتبطة بهذا الحساب.</p>
      </div>
    );
  }

  const kpis = await dashboardKpis(ctx.schoolId);

  return (
    <div dir="rtl" className="space-y-6">
      <h1 className="text-2xl font-bold">لوحة التحكم</h1>

      <section>
        <h2 className="mb-2 text-lg font-semibold">الحسابات</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
          {kpis.accounts.map((a) => (
            <Kpi key={a.account_id} label={a.name} value={formatCurrency(a.balance)} />
          ))}
          <Kpi label="إجمالي الأرصدة" value={formatCurrency(kpis.combined_balance)} />
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">المؤشرات المالية</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
          <Kpi label="المحصّل هذا الشهر" value={formatCurrency(kpis.collected_month)} />
          <Kpi label="المحصّل هذا العام" value={formatCurrency(kpis.collected_year)} />
          <Kpi label="المستحقات المتبقية" value={formatCurrency(kpis.outstanding)} />
          <Kpi label="نسبة التحصيل" value={`${kpis.collection_rate}%`} />
          <Kpi label="المصروفات هذا الشهر" value={formatCurrency(kpis.expenses_month)} />
          <Kpi label="صافي التدفق النقدي" value={formatCurrency(kpis.net_cash_flow_month)} />
          <Kpi label="عدد الطلاب المتأخرين" value={String(kpis.overdue_count)} />
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">الرسائل النصية</h2>
        <div className="max-w-xs">
          <CreditTile remaining={kpis.sms_credit_remaining} />
        </div>
      </section>
    </div>
  );
}

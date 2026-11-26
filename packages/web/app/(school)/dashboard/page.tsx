import {
  Landmark,
  Coins,
  Wallet,
  TrendingUp,
  AlertCircle,
  Percent,
  ReceiptText,
  ArrowDownUp,
  UserX,
} from 'lucide-react';
import { hasPermission, requirePermission } from '../../../lib/auth/guard.js';
import {
  dashboardKpis,
  isFullDashboard,
  type DashboardKpis,
  type DashboardTotals,
} from '../../../lib/queries/dashboard.js';
import { formatCurrency } from '../../../lib/format/currency.js';
import { KpiCard } from '../../../components/dashboard/kpi-card.js';
import { DashboardCharts, TotalsCharts } from '../../../components/dashboard/dashboard-charts.js';
import { CreditTile } from '../../../components/dashboard/credit-tile.js';
import { PageHeader } from '../../../components/layout/index.js';

/**
 * School dashboard (US6, T105; spec 002 T067). Fully derived KPI bundle, RTL.
 *
 * `finance.totals` opens the page. Without `finance.read` (the principal) the
 * database returns only the five totals, and only those cards and the
 * collection gauge render; the account balances, expenses, cash flow and SMS
 * credit are not shown. Phase 1 roles see exactly what they saw before.
 */
export default async function DashboardPage() {
  const ctx = await requirePermission('finance.totals');
  if (!ctx.schoolId) {
    return (
      <div dir="rtl">
        <p className="text-gray-500">لا توجد مدرسة مرتبطة بهذا الحساب.</p>
      </div>
    );
  }

  const kpis = await dashboardKpis(ctx.schoolId);
  const full = hasPermission(ctx, 'finance.read') && isFullDashboard(kpis);

  return (
    <div dir="rtl" className="space-y-6">
      <PageHeader
        title="لوحة التحكم"
        subtitle={full ? 'نظرة عامة على الوضع المالي للمدرسة' : 'ملخّص التحصيل والمستحقات'}
      />

      {full && <AccountsSection kpis={kpis} />}

      <section>
        <h2 className="mb-2 text-lg font-semibold">المؤشرات المالية</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
          <TotalsCards kpis={kpis} />
          {full && <DetailCards kpis={kpis} />}
          <KpiCard
            label="عدد الطلاب المتأخرين"
            value={String(kpis.overdue_count)}
            icon={UserX}
            tone={kpis.overdue_count > 0 ? 'danger' : 'neutral'}
          />
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">الرسوم البيانية</h2>
        {full ? <DashboardCharts kpis={kpis} /> : <TotalsCharts kpis={kpis} />}
      </section>

      {full && (
        <section>
          <h2 className="mb-2 text-lg font-semibold">الرسائل النصية</h2>
          <div className="max-w-xs">
            <CreditTile remaining={kpis.sms_credit_remaining} />
          </div>
        </section>
      )}
    </div>
  );
}

function AccountsSection({ kpis }: { kpis: DashboardKpis }) {
  return (
    <section>
      <h2 className="mb-2 text-lg font-semibold">الحسابات</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
        {kpis.accounts.map((a, i) => (
          <KpiCard
            key={a.account_id}
            label={a.name}
            value={formatCurrency(a.balance)}
            icon={a.type === 'bank' ? Landmark : Wallet}
            tone="primary"
            style={{ animationDelay: `${i * 40}ms` }}
          />
        ))}
        <KpiCard
          label="إجمالي الأرصدة"
          value={formatCurrency(kpis.combined_balance)}
          icon={Coins}
          tone="primary"
          style={{ animationDelay: `${kpis.accounts.length * 40}ms` }}
        />
      </div>
    </section>
  );
}

function TotalsCards({ kpis }: { kpis: DashboardTotals }) {
  return (
    <>
      <KpiCard
        label="المحصّل هذا الشهر"
        value={formatCurrency(kpis.collected_month)}
        icon={Wallet}
        tone="success"
      />
      <KpiCard
        label="المحصّل هذا العام"
        value={formatCurrency(kpis.collected_year)}
        icon={TrendingUp}
        tone="success"
      />
      <KpiCard
        label="المستحقات المتبقية"
        value={formatCurrency(kpis.outstanding)}
        icon={AlertCircle}
        tone="warning"
      />
      <KpiCard label="نسبة التحصيل" value={`${kpis.collection_rate}%`} icon={Percent} tone="info" />
    </>
  );
}

function DetailCards({ kpis }: { kpis: DashboardKpis }) {
  const netFlow = Number(kpis.net_cash_flow_month);
  return (
    <>
      <KpiCard
        label="المصروفات هذا الشهر"
        value={formatCurrency(kpis.expenses_month)}
        icon={ReceiptText}
        tone="danger"
      />
      <KpiCard
        label="صافي التدفق النقدي"
        value={formatCurrency(kpis.net_cash_flow_month)}
        icon={ArrowDownUp}
        tone={netFlow >= 0 ? 'success' : 'danger'}
      />
    </>
  );
}

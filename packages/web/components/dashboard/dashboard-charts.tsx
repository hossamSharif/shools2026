'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@erp/ui';
import type { DashboardKpis } from '../../lib/queries/dashboard.js';
import { CollectionGauge } from './charts/collection-gauge.js';
import { AccountsBarChart } from './charts/accounts-bar-chart.js';
import { FinancialOverviewChart } from './charts/financial-overview-chart.js';

/**
 * Animated charts band for the dashboard (dashboard KPIs/graphs enhancement).
 * Renders three Recharts visualizations entirely from the already-fetched
 * dashboard_kpis scalar bundle — no extra data round-trip. RTL/Arabic.
 */
export function DashboardCharts({ kpis }: { kpis: DashboardKpis }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card className="rise-in lg:col-span-1">
        <CardHeader className="p-4 pb-0">
          <CardTitle className="text-base">نسبة التحصيل</CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <CollectionGauge rate={Number(kpis.collection_rate)} />
        </CardContent>
      </Card>

      <Card className="rise-in lg:col-span-2" style={{ animationDelay: '80ms' }}>
        <CardHeader className="p-4 pb-0">
          <CardTitle className="text-base">النظرة المالية هذا الشهر</CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <FinancialOverviewChart
            collectedMonth={kpis.collected_month}
            expensesMonth={kpis.expenses_month}
            outstanding={kpis.outstanding}
          />
        </CardContent>
      </Card>

      {kpis.accounts.length > 0 && (
        <Card className="rise-in lg:col-span-3" style={{ animationDelay: '160ms' }}>
          <CardHeader className="p-4 pb-0">
            <CardTitle className="text-base">أرصدة الحسابات</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <AccountsBarChart accounts={kpis.accounts} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

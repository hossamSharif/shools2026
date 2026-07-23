'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatCurrency } from '../../../lib/format/currency.js';
import { AXIS_TICK, CHART_ANIMATION, CHART_COLORS } from './chart-theme.js';

/**
 * Financial-overview bar chart (dashboard charts): this month's collected vs.
 * expenses vs. outstanding receivables, from the derived KPI bundle. Each bar
 * carries its own semantic tone. RTL: category order is right-to-left.
 */
export function FinancialOverviewChart({
  collectedMonth,
  expensesMonth,
  outstanding,
}: {
  collectedMonth: string;
  expensesMonth: string;
  outstanding: string;
}) {
  // Declared right-to-left so the first item renders on the right (RTL).
  const data = [
    { name: 'المستحقات', value: Number(outstanding), fill: CHART_COLORS.warning },
    { name: 'المصروفات', value: Number(expensesMonth), fill: CHART_COLORS.danger },
    { name: 'المحصّل', value: Number(collectedMonth), fill: CHART_COLORS.success },
  ];

  const compact = (n: number) =>
    new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n);

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.border} vertical={false} />
          <XAxis dataKey="name" tick={AXIS_TICK} tickLine={false} axisLine={false} />
          <YAxis
            orientation="right"
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={56}
            tickFormatter={compact}
          />
          <Tooltip
            cursor={{ fill: 'rgba(14,110,102,0.06)' }}
            formatter={(v: number) => [formatCurrency(String(v)), 'القيمة']}
            contentStyle={{
              direction: 'rtl',
              background: '#FFFFFF',
              border: `1px solid ${CHART_COLORS.border}`,
              borderRadius: 8,
              fontSize: 13,
            }}
          />
          <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={72} {...CHART_ANIMATION}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

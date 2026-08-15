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
import { AXIS_TICK, CHART_ANIMATION, CHART_COLORS, CHART_SERIES } from './chart-theme.js';

/**
 * Per-account balances bar chart (dashboard charts) — the real multi-bar
 * analogue of the reference "Average Sales" chart, drawn from the derived
 * accounts[] bundle. Categories are reversed so bars read right-to-left (RTL).
 */
export function AccountsBarChart({
  accounts,
}: {
  accounts: { name: string; balance: string }[];
}) {
  // Reverse for RTL: first account sits on the right edge.
  const data = accounts
    .map((a) => ({ name: a.name, value: Number(a.balance) }))
    .reverse();

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
            formatter={(v: number) => [formatCurrency(String(v)), 'الرصيد']}
            contentStyle={{
              direction: 'rtl',
              background: '#FFFFFF',
              border: `1px solid ${CHART_COLORS.border}`,
              borderRadius: 8,
              fontSize: 13,
            }}
          />
          <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={72} {...CHART_ANIMATION}>
            {data.map((_, i) => (
              <Cell key={i} fill={CHART_SERIES[i % CHART_SERIES.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

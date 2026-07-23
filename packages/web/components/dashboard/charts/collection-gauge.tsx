'use client';

import { RadialBar, RadialBarChart, PolarAngleAxis, ResponsiveContainer } from 'recharts';
import { CHART_ANIMATION, CHART_COLORS } from './chart-theme.js';

/**
 * Collection-rate gauge (dashboard charts). Renders the derived collection_rate
 * scalar as a sweeping radial dial — the RTL/Arabic analogue of the reference
 * "Success Rate" gauge. Tone shifts by threshold. Client-only (Recharts).
 */
export function CollectionGauge({ rate }: { rate: number }) {
  const pct = Math.max(0, Math.min(100, rate));
  const color =
    pct >= 75 ? CHART_COLORS.success : pct >= 50 ? CHART_COLORS.info : CHART_COLORS.warning;

  return (
    <div className="relative h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart
          innerRadius="72%"
          outerRadius="100%"
          barSize={16}
          data={[{ name: 'نسبة التحصيل', value: pct, fill: color }]}
          startAngle={90}
          endAngle={-270}
        >
          <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
          <RadialBar
            background={{ fill: CHART_COLORS.border }}
            dataKey="value"
            cornerRadius={12}
            {...CHART_ANIMATION}
          />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold text-gray-900">
          {pct.toLocaleString('en-US', { maximumFractionDigits: 1 })}%
        </span>
        <span className="text-xs text-muted-foreground">نسبة التحصيل</span>
      </div>
    </div>
  );
}

import type { LucideIcon } from 'lucide-react';
import { Card, CardContent, cn } from '@erp/ui';

/**
 * Redesigned dashboard KPI card (dashboard KPIs/graphs enhancement).
 * Presentational + server-compatible: a tinted lucide icon chip beside a
 * labelled value, with a semantic tone drawn from the "Nile teal" tokens.
 * Replaces the bare inline `Kpi` previously defined in the dashboard page.
 */

export type KpiTone = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const TONE_CHIP: Record<KpiTone, string> = {
  primary: 'bg-primary/10 text-primary',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  danger: 'bg-danger/10 text-danger',
  info: 'bg-info/10 text-info',
  neutral: 'bg-muted text-muted-foreground',
};

export function KpiCard({
  label,
  value,
  icon: Icon,
  tone = 'neutral',
  hint,
  className,
  style,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  tone?: KpiTone;
  hint?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <Card
      className={cn('rise-in transition-shadow hover:shadow-md', className)}
      style={style}
      data-testid="kpi-card"
    >
      <CardContent className="flex items-start gap-3 p-4">
        <span
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg',
            TONE_CHIP[tone],
          )}
          aria-hidden
        >
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 space-y-0.5">
          <p className="truncate text-sm text-muted-foreground" data-testid="kpi-label">
            {label}
          </p>
          <p
            className="text-2xl font-bold leading-tight text-gray-900"
            data-testid="kpi-value"
          >
            {value}
          </p>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

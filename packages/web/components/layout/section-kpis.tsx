import type { LucideIcon } from 'lucide-react';
import { cn } from '@erp/ui';
import { KpiCard, type KpiTone } from '../dashboard/kpi-card.js';

export interface SectionKpi {
  label: string;
  value: string;
  icon: LucideIcon;
  tone?: KpiTone;
  hint?: string;
}

/**
 * The KPI strip that sits under a section's PageHeader. Reuses the dashboard's
 * `KpiCard` verbatim (one card component app-wide) and only owns the responsive
 * grid + the staggered entrance already used on the dashboard page.
 */
export function SectionKpis({ items, className }: { items: SectionKpi[]; className?: string }) {
  if (items.length === 0) return null;
  return (
    <div
      className={cn('grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4', className)}
      data-testid="section-kpis"
    >
      {items.map((k, i) => (
        <KpiCard
          key={k.label}
          label={k.label}
          value={k.value}
          icon={k.icon}
          tone={k.tone}
          hint={k.hint}
          style={{ animationDelay: `${i * 40}ms` }}
        />
      ))}
    </div>
  );
}

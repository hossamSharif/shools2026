import { cn } from '@erp/ui';

/**
 * Standard section header (students/payments/expenses design pass).
 *
 * RTL layout: title + subtitle sit at the *start* (right edge), the action
 * buttons at the *end* (left edge) — `justify-between` inside the `dir="rtl"`
 * page does that without any explicit left/right classes. Server-compatible:
 * `actions` is a plain ReactNode slot, so a page can drop client components
 * (modal triggers) into it without making the header itself a client component.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  className,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn('flex flex-wrap items-start justify-between gap-3', className)}
      data-testid="page-header"
    >
      <div className="min-w-0">
        <h1 className="truncate text-2xl font-bold text-gray-900">{title}</h1>
        {subtitle ? (
          <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2" data-testid="page-actions">
          {actions}
        </div>
      ) : null}
    </div>
  );
}

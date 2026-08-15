import { cn } from '@erp/ui';
import type { FinStatus, InstallmentStatus } from '../../lib/queries/students.js';

/**
 * Financial-state pill, shared by the students table, the mobile card list and
 * the profile page. The state itself is decided in Postgres
 * (`student_directory.fin_status` / `student_installments.status`) — this maps
 * it to an Arabic label and a tone, nothing more.
 */

const STUDENT_LABEL: Record<FinStatus, string> = {
  paid: 'مسدد بالكامل',
  partial: 'سداد جزئي',
  overdue: 'متأخر السداد',
  unpaid: 'لم يسدد',
};

const INSTALLMENT_LABEL: Record<InstallmentStatus, string> = {
  paid: 'مسدد',
  partial: 'جزئي',
  overdue: 'متأخر',
  upcoming: 'قادم',
};

const TONE: Record<FinStatus | InstallmentStatus, string> = {
  paid: 'bg-success/10 text-success',
  partial: 'bg-info/10 text-info',
  overdue: 'bg-danger/10 text-danger',
  unpaid: 'bg-warning/10 text-warning',
  upcoming: 'bg-muted text-muted-foreground',
};

export function FinStatusBadge({
  status,
  variant = 'student',
  className,
}: {
  status: FinStatus | InstallmentStatus | null;
  variant?: 'student' | 'installment';
  className?: string;
}) {
  // Null means the student has no installments at all — not a financial state.
  if (!status) return <span className="text-muted-foreground">—</span>;

  const label =
    variant === 'installment'
      ? INSTALLMENT_LABEL[status as InstallmentStatus]
      : STUDENT_LABEL[status as FinStatus];

  return (
    <span
      data-testid="fin-status"
      data-status={status}
      className={cn(
        'inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium',
        TONE[status],
        className,
      )}
    >
      {label ?? status}
    </span>
  );
}

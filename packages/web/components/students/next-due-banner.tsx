import { CalendarClock, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { cn } from '@erp/ui';
import { formatCurrency } from '../../lib/format/currency.js';
import { formatDate } from '../../lib/format/date.js';
import type { StudentFinancialSummary } from '../../lib/queries/students.js';

/**
 * "What does this student owe next?" — the single question a fee clerk asks
 * most, answered above the fold. Turns red once the next due date has already
 * passed (the overdue judgement itself comes from Postgres, in Africa/Khartoum).
 */
export function NextDueBanner({ summary }: { summary: StudentFinancialSummary }) {
  const remaining = summary.installments_total - summary.installments_settled;

  if (!summary.next_due_date) {
    return (
      <div
        data-testid="next-due"
        className="flex items-center gap-3 rounded-md border border-success/30 bg-success/5 p-4"
      >
        <CheckCircle2 className="h-5 w-5 shrink-0 text-success" aria-hidden />
        <p className="text-sm font-medium text-success">
          {summary.installments_total > 0
            ? 'لا توجد أقساط مستحقة — تم سداد كامل الجدول.'
            : 'لا يوجد جدول أقساط لهذا الطالب بعد.'}
        </p>
      </div>
    );
  }

  const late = summary.days_overdue > 0;

  return (
    <div
      data-testid="next-due"
      data-late={late ? 'true' : 'false'}
      className={cn(
        'flex flex-wrap items-center justify-between gap-4 rounded-md border p-4',
        late ? 'border-danger/30 bg-danger/5' : 'border-info/30 bg-info/5',
      )}
    >
      <div className="flex items-center gap-3">
        {late ? (
          <AlertTriangle className="h-5 w-5 shrink-0 text-danger" aria-hidden />
        ) : (
          <CalendarClock className="h-5 w-5 shrink-0 text-info" aria-hidden />
        )}
        <div>
          <p className={cn('text-sm font-semibold', late ? 'text-danger' : 'text-info')}>
            {late ? 'دفعة متأخرة' : 'الدفعة القادمة'} —{' '}
            {formatDate(`${summary.next_due_date}T00:00:00Z`)}
          </p>
          <p className="text-sm text-muted-foreground">
            المبلغ: {formatCurrency(summary.next_due_amount)}
            {late ? ` · متأخر منذ ${summary.days_overdue} يوماً` : ''}
          </p>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        المتبقي: {remaining} من {summary.installments_total} قسط
      </p>
    </div>
  );
}

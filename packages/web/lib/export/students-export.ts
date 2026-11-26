import type { StudentDirectoryRow, FinStatus } from '../queries/students.js';

/**
 * Tabular (CSV) export of the filtered students directory. No money math —
 * amounts pass through exactly as Postgres derived them (Article VI). Mirrors
 * `receivables-export.ts` (same escaping and BOM convention).
 */

const BASE_HEADERS = ['الطالب', 'ولي الأمر', 'الهاتف', 'الصف', 'الشعبة', 'حالة الطالب'];

const FINANCE_HEADERS = [
  'إجمالي الرسوم',
  'الخصومات',
  'المدفوع',
  'الرصيد المستحق',
  'المتأخر',
  'أيام التأخير',
  'الاستحقاق القادم',
  'مبلغ الاستحقاق القادم',
  'الحالة المالية',
];

/** Indicator-only fee standing (spec 002): no amounts, no dates. */
const INDICATOR_LABEL_AR: Partial<Record<FinStatus, string>> = {
  paid: 'مدفوع',
  partial: 'مدفوع جزئياً',
  unpaid: 'غير مدفوع',
};

/** Which columns the caller may export (spec 002, T068); mirrors the directory's NULLs. */
export interface StudentsCsvOptions {
  finance: boolean;
  indicator: boolean;
}

const STATUS_LABEL_AR: Record<StudentDirectoryRow['status'], string> = {
  active: 'نشط',
  withdrawn: 'منسحب',
  graduated: 'متخرج',
};

const FIN_LABEL_AR: Record<FinStatus, string> = {
  paid: 'مسدد بالكامل',
  partial: 'سداد جزئي',
  overdue: 'متأخر السداد',
  unpaid: 'لم يسدد',
};

function escapeCsv(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * UTF-8 (BOM-prefixed, Excel-friendly) CSV for the current filtered view.
 * Without `finance.read` the finance columns are left out entirely (the
 * directory returns them NULL); with the fee indicator only, a single
 * three-state "حالة الرسوم" column is added.
 */
export function studentsToCsv(
  rows: StudentDirectoryRow[],
  opts: StudentsCsvOptions = { finance: true, indicator: true },
): string {
  const headers = opts.finance
    ? [...BASE_HEADERS, ...FINANCE_HEADERS]
    : opts.indicator
      ? [...BASE_HEADERS, 'حالة الرسوم']
      : BASE_HEADERS;
  const lines = [headers.join(',')];
  for (const r of rows) {
    const base: unknown[] = [
      r.name,
      r.guardian_name ?? '',
      r.guardian_phone ?? '',
      r.grade_label ?? '',
      r.section_name ?? '',
      STATUS_LABEL_AR[r.status],
    ];
    const tail: unknown[] = opts.finance
      ? [
          r.total_charged,
          r.total_discount,
          r.total_paid,
          r.total_owed,
          r.overdue_amount,
          r.days_overdue,
          r.next_due_date ?? '',
          r.next_due_amount,
          r.fin_status ? FIN_LABEL_AR[r.fin_status] : '',
        ]
      : opts.indicator
        ? [r.fin_status ? (INDICATOR_LABEL_AR[r.fin_status] ?? '') : '']
        : [];
    lines.push([...base, ...tail].map((v) => escapeCsv(String(v ?? ''))).join(','));
  }
  return `\ufeff${lines.join('\n')}`;
}

import type { StudentDirectoryRow, FinStatus } from '../queries/students.js';

/**
 * Tabular (CSV) export of the filtered students directory. No money math —
 * amounts pass through exactly as Postgres derived them (Article VI). Mirrors
 * `receivables-export.ts` (same escaping and BOM convention).
 */

const HEADERS = [
  'الطالب',
  'ولي الأمر',
  'الهاتف',
  'الصف',
  'الشعبة',
  'حالة الطالب',
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

/** UTF-8 (BOM-prefixed, Excel-friendly) CSV for the current filtered view. */
export function studentsToCsv(rows: StudentDirectoryRow[]): string {
  const lines = [HEADERS.join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.name,
        r.guardian_name ?? '',
        r.guardian_phone ?? '',
        r.grade_label ?? '',
        r.section_name ?? '',
        STATUS_LABEL_AR[r.status],
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
        .map((v) => escapeCsv(String(v)))
        .join(','),
    );
  }
  return `﻿${lines.join('\n')}`;
}

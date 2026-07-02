import type { ReceivableRow } from '../queries/receivables.js';

/**
 * Tabular (CSV) export of the receivables aging report (US5, T101). No money
 * math here — amounts are passed through as-is (Article VI).
 */

const HEADERS = [
  'الطالب',
  'الحالة',
  'الصف',
  'الشعبة',
  'الحالي',
  '١-٣٠ يوم',
  '٣١-٦٠ يوم',
  '٦١-٩٠ يوم',
  'أكثر من ٩٠ يوم',
  'الإجمالي',
];

const STATUS_LABEL_AR: Record<ReceivableRow['status'], string> = {
  active: 'نشط',
  withdrawn: 'منسحب',
  graduated: 'متخرج',
};

function escapeCsv(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Builds a UTF-8 (BOM-prefixed, Excel-friendly) CSV string for the report rows. */
export function receivablesToCsv(rows: ReceivableRow[]): string {
  const lines = [HEADERS.join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.student_name,
        STATUS_LABEL_AR[r.status],
        r.grade_label ?? '',
        r.section_name ?? '',
        r.current_amount,
        r.bucket_1_30,
        r.bucket_31_60,
        r.bucket_61_90,
        r.bucket_90_plus,
        r.total_owed,
      ]
        .map((v) => escapeCsv(String(v)))
        .join(','),
    );
  }
  return `﻿${lines.join('\n')}`;
}

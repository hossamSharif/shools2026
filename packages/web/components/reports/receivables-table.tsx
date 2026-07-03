'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@erp/ui';
import { formatCurrency } from '../../lib/format/currency.js';
import type { ReceivableRow } from '../../lib/queries/receivables.js';

const STATUS_LABEL_AR: Record<ReceivableRow['status'], string> = {
  active: 'نشط',
  withdrawn: 'منسحب',
  graduated: 'متخرج',
};

const columns: ColumnDef<ReceivableRow, unknown>[] = [
  { accessorKey: 'student_name', header: 'الطالب' },
  {
    accessorKey: 'status',
    header: 'الحالة',
    cell: (c) => STATUS_LABEL_AR[c.getValue() as ReceivableRow['status']],
  },
  { accessorKey: 'grade_label', header: 'الصف', cell: (c) => (c.getValue() as string) ?? '—' },
  { accessorKey: 'section_name', header: 'الشعبة', cell: (c) => (c.getValue() as string) ?? '—' },
  { accessorKey: 'current_amount', header: 'الحالي', cell: (c) => formatCurrency(String(c.getValue())) },
  { accessorKey: 'bucket_1_30', header: '١-٣٠ يوم', cell: (c) => formatCurrency(String(c.getValue())) },
  { accessorKey: 'bucket_31_60', header: '٣١-٦٠ يوم', cell: (c) => formatCurrency(String(c.getValue())) },
  { accessorKey: 'bucket_61_90', header: '٦١-٩٠ يوم', cell: (c) => formatCurrency(String(c.getValue())) },
  { accessorKey: 'bucket_90_plus', header: 'أكثر من ٩٠ يوم', cell: (c) => formatCurrency(String(c.getValue())) },
  { accessorKey: 'total_owed', header: 'الإجمالي', cell: (c) => formatCurrency(String(c.getValue())) },
];

/**
 * Client-side wrapper around the shared DataTable (US5, T100). Same fix as
 * components/statement/statement-table.tsx: column defs with `cell` render
 * functions must live inside the client boundary, not be passed in from the
 * Server Component page (React rejects functions crossing that boundary).
 */
export function ReceivablesTable({ data }: { data: ReceivableRow[] }) {
  return <DataTable columns={columns} data={data} emptyMessage="لا توجد مستحقات" />;
}

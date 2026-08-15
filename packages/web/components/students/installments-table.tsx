'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@erp/ui';
import { formatCurrency } from '../../lib/format/currency.js';
import { formatDate } from '../../lib/format/date.js';
import type { StudentInstallmentRow } from '../../lib/queries/students.js';
import { FinStatusBadge } from './fin-status-badge.js';

/**
 * The student's installment schedule — what has been billed, what is settled,
 * and what is still to pay. Status per row is decided in Postgres
 * (`student_installments`), including the Africa/Khartoum overdue cut-off.
 */
const columns: ColumnDef<StudentInstallmentRow, unknown>[] = [
  {
    accessorKey: 'sequence',
    header: 'القسط',
    cell: (c) =>
      c.row.original.is_carried_in ? (
        <span title="رصيد مرحّل من قبل الانضمام">رصيد مرحّل</span>
      ) : (
        `قسط ${c.getValue() as number}`
      ),
  },
  {
    accessorKey: 'due_date',
    header: 'تاريخ الاستحقاق',
    cell: (c) => formatDate(`${c.getValue() as string}T00:00:00Z`),
  },
  {
    accessorKey: 'amount_charged',
    header: 'المبلغ',
    cell: (c) => formatCurrency(c.getValue() as string),
  },
  {
    accessorKey: 'amount_paid',
    header: 'المدفوع',
    cell: (c) => formatCurrency(c.getValue() as string),
  },
  {
    accessorKey: 'amount_discount',
    header: 'الخصم',
    cell: (c) => formatCurrency(c.getValue() as string),
  },
  {
    accessorKey: 'remaining',
    header: 'المتبقي',
    cell: (c) => {
      const v = c.getValue() as string;
      return (
        <span className={Number(v) > 0 ? 'font-medium text-danger' : 'text-muted-foreground'}>
          {formatCurrency(v)}
        </span>
      );
    },
  },
  {
    accessorKey: 'status',
    header: 'الحالة',
    cell: (c) => (
      <FinStatusBadge status={c.row.original.status} variant="installment" />
    ),
  },
];

export function InstallmentsTable({ data }: { data: StudentInstallmentRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={data}
      emptyMessage="لا توجد أقساط — سجّل الطالب في صف لتوليد جدول الأقساط"
    />
  );
}

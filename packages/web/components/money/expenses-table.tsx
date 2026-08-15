'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { DataTable, cn } from '@erp/ui';
import { formatCurrency } from '../../lib/format/currency.js';
import { formatDateTime } from '../../lib/format/date.js';
import type { ExpenseListRow } from '../../lib/queries/money-events.js';

/** Expense list. Reversing entries stay visible and labelled (Article III). */
const columns: ColumnDef<ExpenseListRow, unknown>[] = [
  {
    accessorKey: 'occurred_at',
    header: 'التاريخ',
    cell: (c) => formatDateTime(c.getValue() as string),
  },
  {
    accessorKey: 'category',
    header: 'الفئة',
    cell: (c) => (c.getValue() as string | null) ?? '—',
  },
  {
    accessorKey: 'vendor',
    header: 'المورد',
    cell: (c) => (c.getValue() as string | null) ?? '—',
  },
  {
    accessorKey: 'description',
    header: 'الوصف',
    cell: (c) => (c.getValue() as string | null) ?? '—',
  },
  {
    accessorKey: 'amount',
    header: 'المبلغ',
    cell: (c) => (
      <span
        className={cn(
          'font-medium',
          c.row.original.reverses_event_id && 'text-muted-foreground line-through',
        )}
      >
        {formatCurrency(c.getValue() as string)}
      </span>
    ),
  },
  {
    id: 'account',
    header: 'الحساب',
    cell: (c) => c.row.original.account?.name ?? '—',
  },
  {
    id: 'state',
    header: 'الحالة',
    cell: (c) =>
      c.row.original.reverses_event_id ? (
        <span className="text-xs text-muted-foreground">قيد عكسي</span>
      ) : (
        <span className="text-xs text-success">مؤكد</span>
      ),
  },
];

export function ExpensesTable({ data }: { data: ExpenseListRow[] }) {
  return (
    <DataTable columns={columns} data={data} emptyMessage="لا توجد مصروفات مطابقة لعوامل التصفية" />
  );
}

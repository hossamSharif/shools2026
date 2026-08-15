'use client';

import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable, cn } from '@erp/ui';
import { formatCurrency } from '../../lib/format/currency.js';
import { formatDateTime } from '../../lib/format/date.js';
import type { PaymentListRow } from '../../lib/queries/money-events.js';

/**
 * Fee-payment list. Reversing entries are shown and labelled rather than
 * hidden — the log is append-only and a correction never removes the original
 * (Article III).
 */
const columns: ColumnDef<PaymentListRow, unknown>[] = [
  {
    accessorKey: 'receipt_no',
    header: 'رقم الإيصال',
    cell: (c) => {
      const no = c.getValue() as number | null;
      return (
        <Link
          href={`/payments/${c.row.original.id}/receipt`}
          className="font-medium text-primary hover:underline"
        >
          {no ?? '—'}
        </Link>
      );
    },
  },
  {
    id: 'student',
    header: 'الطالب',
    cell: (c) => {
      const s = c.row.original.student;
      if (!s) return '—';
      return (
        <Link href={`/students/${s.id}`} className="hover:underline">
          {s.name}
        </Link>
      );
    },
  },
  {
    accessorKey: 'occurred_at',
    header: 'التاريخ',
    cell: (c) => formatDateTime(c.getValue() as string),
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

export function PaymentsTable({ data }: { data: PaymentListRow[] }) {
  return (
    <DataTable columns={columns} data={data} emptyMessage="لا توجد دفعات مطابقة لعوامل التصفية" />
  );
}

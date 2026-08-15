'use client';

import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable, cn } from '@erp/ui';
import { formatCurrency } from '../../lib/format/currency.js';
import { formatDateTime } from '../../lib/format/date.js';
import type { StudentPaymentRow } from '../../lib/queries/students.js';

/**
 * Receipt history for one student.
 *
 * Reversed and reversing rows are shown, struck through and tagged, never
 * filtered out: a correction is a new entry that leaves the original visible
 * (Article III), and hiding either half would make the history lie. The status
 * tag itself stays legible — only the money and the receipt are struck.
 */
function voided(r: StudentPaymentRow): boolean {
  return r.is_reversed || r.is_reversal;
}

const columns: ColumnDef<StudentPaymentRow, unknown>[] = [
  {
    accessorKey: 'occurred_at',
    header: 'التاريخ',
    cell: (c) => (
      <span className={cn(voided(c.row.original) && 'text-muted-foreground')}>
        {formatDateTime(c.getValue() as string)}
      </span>
    ),
  },
  {
    accessorKey: 'receipt_no',
    header: 'رقم الإيصال',
    cell: (c) => {
      const no = c.getValue() as number | null;
      if (no === null) return '—';
      return (
        <Link
          href={`/payments/${c.row.original.money_event_id}/receipt`}
          className={cn(
            'text-primary hover:underline',
            voided(c.row.original) && 'text-muted-foreground line-through',
          )}
        >
          {no}
        </Link>
      );
    },
  },
  {
    accessorKey: 'amount',
    header: 'المبلغ',
    cell: (c) => (
      <span
        className={cn(
          'font-medium',
          voided(c.row.original) && 'text-muted-foreground line-through',
        )}
      >
        {formatCurrency(c.getValue() as string)}
      </span>
    ),
  },
  {
    accessorKey: 'account_name',
    header: 'الحساب',
    cell: (c) => (c.getValue() as string | null) ?? '—',
  },
  {
    id: 'state',
    header: 'الحالة',
    cell: (c) => {
      const { is_reversal, is_reversed } = c.row.original;
      if (is_reversal) return <span className="text-xs text-muted-foreground">قيد عكسي</span>;
      if (is_reversed) return <span className="text-xs text-danger">معكوس</span>;
      return <span className="text-xs text-success">مؤكد</span>;
    },
  },
];

export function PaymentsHistory({ data }: { data: StudentPaymentRow[] }) {
  return <DataTable columns={columns} data={data} emptyMessage="لا توجد دفعات مسجلة بعد" />;
}

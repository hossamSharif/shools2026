'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@erp/ui';

export interface StudentSmsLogRow {
  id: string;
  recipient_phone: string;
  message_text: string;
  status: 'queued' | 'sent' | 'delivered' | 'failed';
  is_manual: boolean;
  created_at: string;
}

const STATUS_LABEL: Record<StudentSmsLogRow['status'], string> = {
  queued: 'قيد الانتظار',
  sent: 'أُرسلت',
  delivered: 'تم التسليم',
  failed: 'فشلت',
};

const columns: ColumnDef<StudentSmsLogRow, unknown>[] = [
  { accessorKey: 'recipient_phone', header: 'الهاتف' },
  {
    accessorKey: 'message_text',
    header: 'النص',
    cell: (c) => (
      <span className="block max-w-md truncate" title={c.getValue() as string}>
        {c.getValue() as string}
      </span>
    ),
  },
  { accessorKey: 'status', header: 'الحالة', cell: (c) => STATUS_LABEL[c.getValue() as StudentSmsLogRow['status']] },
  { accessorKey: 'is_manual', header: 'النوع', cell: (c) => ((c.getValue() as boolean) ? 'يدوي' : 'تلقائي') },
  {
    accessorKey: 'created_at',
    header: 'التاريخ',
    cell: (c) => new Date(c.getValue() as string).toLocaleString('en-US'),
  },
];

/** Client-side wrapper around the shared DataTable — same pattern as StatementTable. */
export function StudentSmsTable({ data }: { data: StudentSmsLogRow[] }) {
  return <DataTable columns={columns} data={data} emptyMessage="لا توجد رسائل بعد لهذا الطالب" />;
}

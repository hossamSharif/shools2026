'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@erp/ui';

export interface SmsLogRow {
  id: string;
  student_id: string;
  recipient_phone: string;
  message_text: string;
  segments: number;
  status: 'queued' | 'sent' | 'delivered' | 'failed';
  is_manual: boolean;
  created_at: string;
  student: { name: string } | { name: string }[] | null;
}

const STATUS_LABEL: Record<SmsLogRow['status'], string> = {
  queued: 'قيد الانتظار',
  sent: 'أُرسلت',
  delivered: 'تم التسليم',
  failed: 'فشلت',
};

const STATUS_CLASS: Record<SmsLogRow['status'], string> = {
  queued: 'bg-gray-100 text-gray-700',
  sent: 'bg-blue-100 text-blue-700',
  delivered: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-red-100 text-red-700',
};

function studentName(row: SmsLogRow): string {
  const s = Array.isArray(row.student) ? row.student[0] : row.student;
  return s?.name ?? '';
}

const columns: ColumnDef<SmsLogRow, unknown>[] = [
  { id: 'student', header: 'الطالب', cell: (c) => studentName(c.row.original) },
  { accessorKey: 'recipient_phone', header: 'الهاتف' },
  {
    accessorKey: 'message_text',
    header: 'النص',
    cell: (c) => (
      <span className="block max-w-xs truncate" title={c.getValue() as string}>
        {c.getValue() as string}
      </span>
    ),
  },
  { accessorKey: 'segments', header: 'المقاطع' },
  {
    accessorKey: 'status',
    header: 'الحالة',
    cell: (c) => {
      const status = c.getValue() as SmsLogRow['status'];
      return (
        <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_CLASS[status]}`}>
          {STATUS_LABEL[status]}
        </span>
      );
    },
  },
  {
    accessorKey: 'is_manual',
    header: 'النوع',
    cell: (c) => ((c.getValue() as boolean) ? 'يدوي' : 'تلقائي'),
  },
  {
    accessorKey: 'created_at',
    header: 'التاريخ',
    cell: (c) => new Date(c.getValue() as string).toLocaleString('en-US'),
  },
];

/** Client-side wrapper around the shared DataTable — same pattern as StatementTable. */
export function SmsLogTable({ data }: { data: SmsLogRow[] }) {
  return <DataTable columns={columns} data={data} emptyMessage="لا توجد رسائل بعد" />;
}

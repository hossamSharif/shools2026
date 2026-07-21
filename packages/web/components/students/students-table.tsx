'use client';

import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@erp/ui';

export interface StudentRow {
  id: string;
  name: string;
  guardian_name: string | null;
  guardian_phone: string | null;
  status: 'active' | 'withdrawn' | 'graduated';
}

const STATUS_AR: Record<StudentRow['status'], string> = {
  active: 'نشط',
  withdrawn: 'منسحب',
  graduated: 'متخرج',
};

const columns: ColumnDef<StudentRow, unknown>[] = [
  {
    accessorKey: 'name',
    header: 'الاسم',
    cell: (c) => (
      <Link href={`/students/${c.row.original.id}`} className="text-emerald-600 hover:underline">
        {c.getValue() as string}
      </Link>
    ),
  },
  {
    accessorKey: 'guardian_name',
    header: 'ولي الأمر',
    cell: (c) => (c.getValue() as string | null) ?? '—',
  },
  {
    accessorKey: 'guardian_phone',
    header: 'الهاتف',
    cell: (c) => (c.getValue() as string | null) ?? '—',
  },
  {
    accessorKey: 'status',
    header: 'الحالة',
    cell: (c) => STATUS_AR[c.getValue() as StudentRow['status']],
  },
  {
    id: 'action',
    header: '',
    cell: (c) => (
      <Link href={`/students/${c.row.original.id}/enroll`} className="text-emerald-600 hover:underline">
        تسجيل
      </Link>
    ),
  },
];

/**
 * Client-side wrapper around the shared DataTable (same pattern as
 * StatementTable/ReceivablesTable — column defs with `cell` render functions
 * must live inside the client boundary).
 */
export function StudentsTable({ data }: { data: StudentRow[] }) {
  return <DataTable columns={columns} data={data} emptyMessage="لا يوجد طلاب بعد" />;
}

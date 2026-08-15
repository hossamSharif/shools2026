'use client';

import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@erp/ui';
import { formatCurrency } from '../../lib/format/currency.js';
import { formatDate } from '../../lib/format/date.js';
import type { StudentDirectoryRow } from '../../lib/queries/students.js';
import { FinStatusBadge } from './fin-status-badge.js';
import { StudentRowActions } from './student-row-actions.js';
import { STUDENT_STATUS_AR } from './labels.js';

/** Re-exported for the mobile card list; the directory RPC is the single source. */
export type StudentRow = StudentDirectoryRow;

const columns: ColumnDef<StudentDirectoryRow, unknown>[] = [
  {
    accessorKey: 'name',
    header: 'الاسم',
    cell: (c) => (
      <Link
        href={`/students/${c.row.original.student_id}`}
        data-testid="student-link"
        className="font-medium text-primary hover:underline"
      >
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
    id: 'class',
    header: 'الصف / الشعبة',
    cell: (c) => {
      const { grade_label, section_name } = c.row.original;
      if (!grade_label) return <span className="text-muted-foreground">غير مسجّل</span>;
      return [grade_label, section_name].filter(Boolean).join(' - ');
    },
  },
  {
    accessorKey: 'total_owed',
    header: 'الرصيد المستحق',
    cell: (c) => {
      const owed = Number(c.getValue() as string);
      return (
        <span className={owed > 0 ? 'font-medium text-danger' : 'text-muted-foreground'}>
          {formatCurrency(c.getValue() as string)}
        </span>
      );
    },
  },
  {
    id: 'next_due',
    header: 'الاستحقاق القادم',
    cell: (c) => {
      const { next_due_date, next_due_amount } = c.row.original;
      if (!next_due_date) return <span className="text-muted-foreground">—</span>;
      return (
        <span className="whitespace-nowrap">
          {formatDate(`${next_due_date}T00:00:00Z`)}
          <span className="ms-2 text-xs text-muted-foreground">
            {formatCurrency(next_due_amount)}
          </span>
        </span>
      );
    },
  },
  {
    accessorKey: 'fin_status',
    header: 'الحالة المالية',
    cell: (c) => <FinStatusBadge status={c.row.original.fin_status} />,
  },
  {
    accessorKey: 'status',
    header: 'حالة الطالب',
    cell: (c) => STUDENT_STATUS_AR[c.getValue() as StudentDirectoryRow['status']],
  },
  {
    id: 'actions',
    header: '',
    cell: (c) => <StudentRowActions row={c.row.original} />,
  },
];

/**
 * Client-side wrapper around the shared DataTable (same pattern as
 * StatementTable/ReceivablesTable — column defs with `cell` render functions
 * must live inside the client boundary).
 */
export function StudentsTable({ data }: { data: StudentDirectoryRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={data}
      emptyMessage="لا يوجد طلاب مطابقون لعوامل التصفية"
    />
  );
}

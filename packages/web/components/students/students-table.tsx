'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@erp/ui';
import { formatCurrency } from '../../lib/format/currency.js';
import { formatDate } from '../../lib/format/date.js';
import type { StudentDirectoryRow } from '../../lib/queries/students.js';
import type { StudentCaps } from '../../lib/auth/student-caps.js';
import { FinStatusBadge } from './fin-status-badge.js';
import { StudentRowActions } from './student-row-actions.js';
import { STUDENT_STATUS_AR } from './labels.js';

/** Re-exported for the mobile card list; the directory RPC is the single source. */
export type StudentRow = StudentDirectoryRow;

type Col = ColumnDef<StudentDirectoryRow, unknown>;

/** Finance columns only with `finance.read`; the fee badge alone with the indicator. */
function buildColumns(caps: StudentCaps): Col[] {
  const cols: Col[] = [
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
  ];
  if (caps.finance)
    cols.push(
      {
        accessorKey: 'total_owed',
        header: 'الرصيد المستحق',
        cell: (c) => {
          const owed = Number(c.getValue() as string | null);
          return (
            <span className={owed > 0 ? 'font-medium text-danger' : 'text-muted-foreground'}>
              {formatCurrency((c.getValue() as string | null) ?? '0')}
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
                {formatCurrency(next_due_amount ?? '0')}
              </span>
            </span>
          );
        },
      },
    );
  if (caps.indicator)
    cols.push({
      accessorKey: 'fin_status',
      header: caps.finance ? 'الحالة المالية' : 'حالة الرسوم',
      cell: (c) => (
        <FinStatusBadge
          status={c.row.original.fin_status}
          variant={caps.finance ? 'student' : 'indicator'}
        />
      ),
    });
  cols.push(
    {
      accessorKey: 'status',
      header: 'حالة الطالب',
      cell: (c) => STUDENT_STATUS_AR[c.getValue() as StudentDirectoryRow['status']],
    },
    {
      id: 'actions',
      header: '',
      cell: (c) => <StudentRowActions row={c.row.original} caps={caps} />,
    },
  );
  return cols;
}

/**
 * Client-side wrapper around the shared DataTable (same pattern as
 * StatementTable/ReceivablesTable — column defs with `cell` render functions
 * must live inside the client boundary).
 */
export function StudentsTable({ data, caps }: { data: StudentDirectoryRow[]; caps: StudentCaps }) {
  const columns = useMemo(() => buildColumns(caps), [caps]);
  return (
    <DataTable columns={columns} data={data} emptyMessage="لا يوجد طلاب مطابقون لعوامل التصفية" />
  );
}

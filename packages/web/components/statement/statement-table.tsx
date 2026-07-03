'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@erp/ui';
import { formatDate } from '../../lib/format/date.js';
import { formatCurrency } from '../../lib/format/currency.js';
import type { StatementEntry } from '../../lib/queries/statement.js';

const TYPE_LABEL_AR: Record<StatementEntry['entry_type'], string> = {
  charge: 'قسط',
  payment: 'دفعة',
  discount: 'خصم',
  adjustment: 'تسوية',
  refund: 'استرداد',
};

const columns: ColumnDef<StatementEntry, unknown>[] = [
  { accessorKey: 'entry_date', header: 'التاريخ', cell: (c) => formatDate(c.getValue() as string) },
  {
    accessorKey: 'entry_type',
    header: 'النوع',
    cell: (c) => TYPE_LABEL_AR[c.getValue() as StatementEntry['entry_type']],
  },
  { accessorKey: 'description', header: 'الوصف' },
  { accessorKey: 'charge', header: 'مدين', cell: (c) => formatCurrency(String(c.getValue() ?? '0')) },
  { accessorKey: 'credit', header: 'دائن', cell: (c) => formatCurrency(String(c.getValue() ?? '0')) },
  {
    accessorKey: 'running_balance',
    header: 'الرصيد الجاري',
    cell: (c) => formatCurrency(String(c.getValue() ?? '0')),
  },
];

/**
 * Client-side wrapper around the shared DataTable (US5, T098). Column defs
 * with render `cell` functions cannot be passed from the Server Component
 * page straight into `@erp/ui`'s ('use client') DataTable — React rejects
 * functions crossing the Server→Client boundary ("Functions cannot be passed
 * directly to Client Components..."). This was a real bug, found live while
 * running the Gauntlet E2E specs (no route using this table had ever been
 * exercised through a running dev server before this session). Fix: define
 * the columns here, inside the client boundary, and only pass serializable
 * `data` in from the server page.
 */
export function StatementTable({ data }: { data: StatementEntry[] }) {
  return <DataTable columns={columns} data={data} emptyMessage="لا توجد حركات على هذا الطالب" />;
}

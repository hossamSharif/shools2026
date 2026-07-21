'use client';

import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@erp/ui';

export interface SchoolRow {
  id: string;
  name: string;
  subscriptionStart: string;
  subscriptionEnd: string;
  creditBalance: string;
}

/** Client-side wrapper around the shared DataTable — same pattern as StatementTable.
 * Row fields are pre-formatted server-side (dates/numbers) so only plain strings
 * cross the server/client boundary. */
export function SchoolsTable({
  data,
  labels,
}: {
  data: SchoolRow[];
  labels: { name: string; subscriptionStart: string; subscriptionEnd: string; creditBalance: string; addCredit: string; empty: string };
}) {
  const columns: ColumnDef<SchoolRow, unknown>[] = [
    { accessorKey: 'name', header: labels.name },
    { accessorKey: 'subscriptionStart', header: labels.subscriptionStart },
    { accessorKey: 'subscriptionEnd', header: labels.subscriptionEnd },
    { accessorKey: 'creditBalance', header: labels.creditBalance },
    {
      id: 'action',
      header: '',
      cell: (c) => (
        <Link href={`/schools/${c.row.original.id}/credit`} className="text-emerald-600 hover:underline">
          {labels.addCredit}
        </Link>
      ),
    },
  ];

  return <DataTable columns={columns} data={data} emptyMessage={labels.empty} />;
}

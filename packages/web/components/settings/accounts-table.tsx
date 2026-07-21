'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@erp/ui';

export interface AccountRow {
  id: string;
  name: string;
  typeLabel: string;
  account_number: string | null;
  openingBalance: string;
  currentBalance: string;
}

const columns: ColumnDef<AccountRow, unknown>[] = [
  { accessorKey: 'name', header: 'الاسم' },
  { accessorKey: 'typeLabel', header: 'النوع' },
  { accessorKey: 'account_number', header: 'رقم الحساب', cell: (c) => (c.getValue() as string | null) ?? '—' },
  { accessorKey: 'openingBalance', header: 'الرصيد الافتتاحي' },
  { accessorKey: 'currentBalance', header: 'الرصيد الحالي' },
];

/** Client-side wrapper around the shared DataTable — same pattern as StatementTable. */
export function AccountsTable({ data }: { data: AccountRow[] }) {
  return <DataTable columns={columns} data={data} emptyMessage="لا توجد حسابات بعد" />;
}

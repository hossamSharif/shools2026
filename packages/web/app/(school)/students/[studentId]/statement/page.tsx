import { notFound } from 'next/navigation';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable, Card, CardContent } from '@erp/ui';
import { createSupabaseServerClient } from '../../../../../lib/supabase/server.js';
import { studentStatement, totalOwed, type StatementEntry } from '../../../../../lib/queries/statement.js';
import { formatDate } from '../../../../../lib/format/date.js';
import { formatCurrency } from '../../../../../lib/format/currency.js';

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

/** Student statement page (US5, T098). RTL, running balance + total owed. */
export default async function StatementPage({ params }: { params: { studentId: string } }) {
  const supabase = createSupabaseServerClient();
  const { data: student } = await supabase
    .from('student')
    .select('id, name')
    .eq('id', params.studentId)
    .single<{ id: string; name: string }>();
  if (!student) notFound();

  const entries = await studentStatement(student.id);
  const owed = totalOwed(entries);

  return (
    <div dir="rtl" className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">كشف حساب — {student.name}</h1>
        <a
          href={`/students/${student.id}/statement/pdf`}
          target="_blank"
          rel="noreferrer"
          className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
        >
          تصدير PDF
        </a>
      </div>

      <Card className="max-w-xs">
        <CardContent className="pt-6 text-center">
          <p className="text-sm text-gray-500">إجمالي المستحق</p>
          <p className="text-xl font-bold">{formatCurrency(owed)}</p>
        </CardContent>
      </Card>

      <DataTable columns={columns} data={entries} emptyMessage="لا توجد حركات على هذا الطالب" />
    </div>
  );
}

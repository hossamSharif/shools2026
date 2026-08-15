import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent } from '@erp/ui';
import { createSupabaseServerClient } from '../../../../../lib/supabase/server.js';
import { studentStatement, totalOwed } from '../../../../../lib/queries/statement.js';
import { formatCurrency } from '../../../../../lib/format/currency.js';
import { StatementTable } from '../../../../../components/statement/statement-table.js';

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
        <div>
          <h1 className="text-2xl font-bold">كشف حساب — {student.name}</h1>
          <Link
            href={`/students/${student.id}`}
            className="text-sm text-primary hover:underline"
          >
            العودة لملف الطالب
          </Link>
        </div>
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

      <StatementTable data={entries} />
    </div>
  );
}

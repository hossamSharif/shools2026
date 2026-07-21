import { NextResponse } from 'next/server';
import type * as ReactPdf from '@react-pdf/renderer';
import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '../../../../../../lib/supabase/server.js';
import { studentStatement, totalOwed } from '../../../../../../lib/queries/statement.js';
import { formatDate } from '../../../../../../lib/format/date.js';
import { formatCurrency } from '../../../../../../lib/format/currency.js';
import { StatementDocument, type StatementPdfRow } from '../../../../../../pdf/statement.js';

const TYPE_LABEL_AR: Record<string, string> = {
  charge: 'قسط',
  payment: 'دفعة',
  discount: 'خصم',
  adjustment: 'تسوية',
  refund: 'استرداد',
};

// See pdf/statement.tsx for why this is a runtime require, not a static import.
const { renderToBuffer } = (eval('require') as NodeRequire)('@react-pdf/renderer') as typeof ReactPdf;

/** Statement PDF export (US5, T099). RTL Arabic, SDG amounts. */
export async function GET(_request: Request, { params }: { params: { studentId: string } }) {
  const supabase = createSupabaseServerClient();
  const { data: student } = await supabase
    .from('student')
    .select('id, name')
    .eq('id', params.studentId)
    .single<{ id: string; name: string }>();
  if (!student) notFound();

  let gradeLabel: string | undefined;
  let sectionName: string | undefined;
  const { data: enr } = await supabase
    .from('enrollment')
    .select('grade:grade(label_ar), section:section(name)')
    .eq('student_id', student.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<{ grade: { label_ar: string } | null; section: { name: string } | null }>();
  gradeLabel = enr?.grade?.label_ar ?? undefined;
  sectionName = enr?.section?.name ?? undefined;

  const entries = await studentStatement(student.id);
  const rows: StatementPdfRow[] = entries.map((e) => ({
    date: formatDate(e.entry_date),
    typeLabel: TYPE_LABEL_AR[e.entry_type] ?? e.entry_type,
    description: e.description,
    charge: formatCurrency(e.charge),
    credit: formatCurrency(e.credit),
    runningBalance: formatCurrency(e.running_balance),
  }));

  const buffer = await renderToBuffer(
    StatementDocument({
      data: {
        studentName: student.name,
        gradeLabel,
        sectionName,
        totalOwed: formatCurrency(totalOwed(entries)),
        rows,
      },
    }),
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="statement-${student.id}.pdf"`,
    },
  });
}

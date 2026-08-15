import { NextResponse } from 'next/server';
import type * as ReactPdf from '@react-pdf/renderer';
import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '../../../../../../lib/supabase/server.js';
import { studentStatement, totalOwed } from '../../../../../../lib/queries/statement.js';
import {
  studentFinancialSummary,
  studentInstallmentSchedule,
} from '../../../../../../lib/queries/students.js';
import { formatDate, formatDateTime } from '../../../../../../lib/format/date.js';
import { formatCurrency } from '../../../../../../lib/format/currency.js';
import {
  StatementDocument,
  type StatementPdfRow,
  type StatementPdfInstallment,
} from '../../../../../../pdf/statement.js';

const TYPE_LABEL_AR: Record<string, string> = {
  charge: 'قسط',
  payment: 'دفعة',
  discount: 'خصم',
  adjustment: 'تسوية',
  refund: 'استرداد',
};

const INSTALLMENT_STATUS_AR: Record<string, string> = {
  paid: 'مسدد',
  partial: 'جزئي',
  overdue: 'متأخر',
  upcoming: 'قادم',
};

const STUDENT_STATUS_AR: Record<string, string> = {
  active: 'نشط',
  withdrawn: 'منسحب',
  graduated: 'متخرج',
};

// See pdf/statement.tsx for why this is a runtime require, not a static import.
const { renderToBuffer } = (eval('require') as NodeRequire)('@react-pdf/renderer') as typeof ReactPdf;

/**
 * Statement PDF export (US5, T099; enriched by the students-section
 * enhancement). RTL Arabic, SDG amounts. Everything numeric arrives already
 * derived from Postgres and is only formatted here (Article VI).
 */
export async function GET(_request: Request, { params }: { params: { studentId: string } }) {
  const supabase = createSupabaseServerClient();
  const { data: student } = await supabase
    .from('student')
    .select('id, name, guardian_name, guardian_phone, status')
    .eq('id', params.studentId)
    .maybeSingle<{
      id: string;
      name: string;
      guardian_name: string | null;
      guardian_phone: string | null;
      status: string;
    }>();
  if (!student) notFound();

  const { data: enr } = await supabase
    .from('enrollment')
    .select('grade:grade(label_ar), section:section(name), academic_year:academic_year(label)')
    .eq('student_id', student.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<{
      grade: { label_ar: string } | null;
      section: { name: string } | null;
      academic_year: { label: string } | null;
    }>();

  const [entries, summary, installments] = await Promise.all([
    studentStatement(student.id),
    studentFinancialSummary(student.id),
    studentInstallmentSchedule(student.id),
  ]);

  const rows: StatementPdfRow[] = entries.map((e) => ({
    date: formatDate(e.entry_date),
    typeLabel: TYPE_LABEL_AR[e.entry_type] ?? e.entry_type,
    description: e.description,
    charge: formatCurrency(e.charge),
    credit: formatCurrency(e.credit),
    runningBalance: formatCurrency(e.running_balance),
  }));

  const pdfInstallments: StatementPdfInstallment[] = installments.map((i) => ({
    label: i.is_carried_in ? 'رصيد مرحّل' : `قسط ${i.sequence}`,
    dueDate: formatDate(`${i.due_date}T00:00:00Z`),
    amount: formatCurrency(i.amount_charged),
    paid: formatCurrency(i.amount_paid),
    remaining: formatCurrency(i.remaining),
    statusLabel: INSTALLMENT_STATUS_AR[i.status] ?? i.status,
  }));

  const buffer = await renderToBuffer(
    StatementDocument({
      data: {
        studentName: student.name,
        gradeLabel: enr?.grade?.label_ar ?? undefined,
        sectionName: enr?.section?.name ?? undefined,
        academicYear: enr?.academic_year?.label ?? undefined,
        guardianName: student.guardian_name ?? undefined,
        guardianPhone: student.guardian_phone ?? undefined,
        studentStatusLabel: STUDENT_STATUS_AR[student.status] ?? student.status,
        summary: {
          totalCharged: formatCurrency(summary.total_charged),
          totalDiscount: formatCurrency(summary.total_discount),
          totalPaid: formatCurrency(summary.total_paid),
          collectionRate: String(summary.collection_rate),
          nextDueDate: summary.next_due_date
            ? formatDate(`${summary.next_due_date}T00:00:00Z`)
            : undefined,
          nextDueAmount: summary.next_due_date
            ? formatCurrency(summary.next_due_amount)
            : undefined,
          daysOverdue: summary.days_overdue,
          overdueAmount: formatCurrency(summary.overdue_amount),
          installmentsSettled: summary.installments_settled,
          installmentsTotal: summary.installments_total,
        },
        installments: pdfInstallments,
        // The ledger's closing running balance stays the headline figure, so
        // the PDF total always reconciles against the statement (Article X).
        totalOwed: formatCurrency(totalOwed(entries)),
        rows,
        printedAt: formatDateTime(new Date()),
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

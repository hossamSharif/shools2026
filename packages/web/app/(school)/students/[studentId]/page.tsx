import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  Receipt,
  BadgePercent,
  Wallet,
  AlertCircle,
  Percent,
  CalendarClock,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@erp/ui';
import { requireAuth } from '../../../../lib/auth/guard.js';
import { createSupabaseServerClient } from '../../../../lib/supabase/server.js';
import {
  studentFinancialSummary,
  studentInstallmentSchedule,
  studentPayments,
} from '../../../../lib/queries/students.js';
import { studentStatement } from '../../../../lib/queries/statement.js';
import { formatCurrency } from '../../../../lib/format/currency.js';
import { formatDate } from '../../../../lib/format/date.js';
import { PageHeader, SectionKpis, type SectionKpi } from '../../../../components/layout/index.js';
import { StatementTable } from '../../../../components/statement/statement-table.js';
import { InstallmentsTable } from '../../../../components/students/installments-table.js';
import { PaymentsHistory } from '../../../../components/students/payments-history.js';
import { NextDueBanner } from '../../../../components/students/next-due-banner.js';
import { StudentProfileActions } from '../../../../components/students/student-profile-actions.js';
import { STUDENT_STATUS_AR } from '../../../../components/students/labels.js';

/**
 * Student profile — the one screen that answers everything about a student:
 * who they are, what they were billed, what they paid, what they owe, what
 * falls due next, and the full ledger behind those numbers.
 *
 * Every figure comes from a Postgres function (`student_financial_summary`,
 * `student_installments`, `student_payments`, `student_statement`) — this page
 * does no money math (Article II/VI).
 */
export const dynamic = 'force-dynamic';

interface StudentRecord {
  id: string;
  name: string;
  guardian_name: string | null;
  guardian_phone: string | null;
  status: 'active' | 'withdrawn' | 'graduated';
  created_at: string;
}

interface EnrollmentRecord {
  created_at: string;
  grade: { label_ar: string } | null;
  section: { name: string } | null;
  academic_year: { label: string } | null;
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium text-gray-900">{value}</dd>
    </div>
  );
}

export default async function StudentProfilePage({
  params,
}: {
  params: { studentId: string };
}) {
  await requireAuth();
  const supabase = createSupabaseServerClient();

  const { data: student } = await supabase
    .from('student')
    .select('id, name, guardian_name, guardian_phone, status, created_at')
    .eq('id', params.studentId)
    .maybeSingle<StudentRecord>();
  if (!student) notFound();

  const { data: enrollment } = await supabase
    .from('enrollment')
    .select('created_at, grade:grade(label_ar), section:section(name), academic_year:academic_year(label)')
    .eq('student_id', student.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<EnrollmentRecord>();

  const [summary, installments, payments, statement] = await Promise.all([
    studentFinancialSummary(student.id),
    studentInstallmentSchedule(student.id),
    studentPayments(student.id),
    studentStatement(student.id),
  ]);

  const classLabel = enrollment?.grade?.label_ar
    ? [enrollment.grade.label_ar, enrollment.section?.name].filter(Boolean).join(' - ')
    : null;
  const subtitle = [classLabel ?? 'غير مسجّل في صف', enrollment?.academic_year?.label]
    .filter(Boolean)
    .join(' · ');

  // Display-only bridge between the installment rows and the canonical balance
  // (see the note by the reconciliation strip below). Summing already-derived
  // figures for presentation only — nothing is written back (Article II).
  const installmentRemaining = installments.reduce((s, i) => s + Number(i.remaining), 0);
  const allocatedDiscount = installments.reduce((s, i) => s + Number(i.amount_discount), 0);
  const unallocatedDiscount = Number(summary.total_discount) - allocatedDiscount;

  const kpis: SectionKpi[] = [
    {
      label: 'إجمالي الرسوم',
      value: formatCurrency(summary.total_charged),
      icon: Receipt,
      tone: 'primary',
    },
    {
      label: 'إجمالي الخصومات',
      value: formatCurrency(summary.total_discount),
      icon: BadgePercent,
      tone: 'info',
    },
    {
      label: 'إجمالي المدفوع',
      value: formatCurrency(summary.total_paid),
      icon: Wallet,
      tone: 'success',
    },
    {
      label: 'الرصيد المستحق',
      value: formatCurrency(summary.total_owed),
      icon: AlertCircle,
      tone: Number(summary.total_owed) > 0 ? 'danger' : 'success',
    },
    {
      label: 'نسبة السداد',
      value: `${summary.collection_rate}%`,
      icon: Percent,
      tone: 'info',
    },
  ];

  if (summary.days_overdue > 0) {
    kpis.push({
      label: 'متأخر منذ',
      value: `${summary.days_overdue} يوماً`,
      icon: CalendarClock,
      tone: 'danger',
      hint: `المتأخر: ${formatCurrency(summary.overdue_amount)}`,
    });
  }

  return (
    <div dir="rtl" className="space-y-6">
      <PageHeader
        title={student.name}
        subtitle={subtitle}
        actions={<StudentProfileActions student={student} />}
      />

      <Card>
        <CardHeader>
          <CardTitle>بيانات الطالب</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <InfoRow label="اسم الطالب" value={student.name} />
            <InfoRow label="ولي الأمر" value={student.guardian_name ?? '—'} />
            <InfoRow
              label="هاتف ولي الأمر"
              value={
                student.guardian_phone ?? (
                  <span className="text-warning">غير مسجّل — لن تصله الرسائل</span>
                )
              }
            />
            <InfoRow label="حالة الطالب" value={STUDENT_STATUS_AR[student.status]} />
            <InfoRow label="الصف / الشعبة" value={classLabel ?? 'غير مسجّل'} />
            <InfoRow label="العام الدراسي" value={enrollment?.academic_year?.label ?? '—'} />
            <InfoRow
              label="تاريخ التسجيل"
              value={enrollment ? formatDate(enrollment.created_at) : '—'}
            />
            <InfoRow label="تاريخ الإضافة" value={formatDate(student.created_at)} />
          </dl>
        </CardContent>
      </Card>

      <SectionKpis items={kpis} className="lg:grid-cols-5" />

      <NextDueBanner summary={summary} />

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">جدول الأقساط</h2>
        <InstallmentsTable data={installments} />
        {/*
          Discounts recorded without a target installment (apply_discount's
          p_installment_id defaults to NULL) reduce the student's balance but
          are invisible to installment_running_balance, so the rows above can
          sum to more than the real balance. Show the bridge explicitly rather
          than letting the two figures silently contradict each other.
        */}
        {unallocatedDiscount > 0 ? (
          <div
            data-testid="installment-reconciliation"
            className="rounded-md border border-border bg-muted p-3 text-sm text-muted-foreground"
          >
            مجموع متبقي الأقساط {formatCurrency(installmentRemaining.toFixed(2))}
            {' − '}
            خصومات غير مخصصة لقسط {formatCurrency(unallocatedDiscount.toFixed(2))}
            {' = '}
            <span className="font-semibold text-gray-900">
              الرصيد المستحق {formatCurrency(summary.total_owed)}
            </span>
          </div>
        ) : null}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">سجل المدفوعات</h2>
        <PaymentsHistory data={payments} />
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">كشف الحساب التفصيلي</h2>
          <Link
            href={`/students/${student.id}/statement`}
            className="text-sm text-primary hover:underline"
          >
            فتح الكشف في صفحة مستقلة
          </Link>
        </div>
        <StatementTable data={statement} />
      </section>
    </div>
  );
}

import { Users, UserCheck, AlertCircle, CircleDollarSign, CheckCircle2 } from 'lucide-react';
import { requireAuth } from '../../../lib/auth/guard.js';
import { createSupabaseServerClient } from '../../../lib/supabase/server.js';
import { studentDirectory } from '../../../lib/queries/students.js';
import { formatCurrency } from '../../../lib/format/currency.js';
import { PageHeader, SectionKpis, type SectionKpi } from '../../../components/layout/index.js';
import { StudentFormDialog } from '../../../components/students/student-form-dialog.js';
import { StudentFilters } from '../../../components/students/student-filters.js';
import { StudentsTable } from '../../../components/students/students-table.js';
import { StudentsCardList } from '../../../components/students/students-card-list.js';

/**
 * Students section (US2 + directory enhancement): header actions → KPI strip →
 * filter rail → table. Every filter is a query-string param, so the view is
 * shareable and the KPI strip below always describes *the filtered set* rather
 * than the whole roster.
 *
 * All search/filter/sort work and every money figure comes from the
 * `student_directory` Postgres function (Article II/VI) — this page only shapes
 * params in and renders rows out.
 */
export const dynamic = 'force-dynamic';

interface StudentsSearchParams {
  q?: string;
  stageId?: string;
  gradeId?: string;
  sectionId?: string;
  yearId?: string;
  status?: string;
  fin?: string;
  due?: string;
  unenrolled?: string;
  nophone?: string;
  sort?: string;
}

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: StudentsSearchParams;
}) {
  const ctx = await requireAuth();
  if (!ctx.schoolId) {
    return (
      <div dir="rtl">
        <p className="text-muted-foreground">لا توجد مدرسة مرتبطة بهذا الحساب.</p>
      </div>
    );
  }

  const supabase = createSupabaseServerClient();
  const [{ data: stages }, { data: grades }, { data: sections }, { data: years }] =
    await Promise.all([
      supabase.from('stage').select('id, label_ar').order('ordinal'),
      supabase.from('grade').select('id, label_ar, stage_id').order('ordinal'),
      supabase
        .from('section')
        .select('id, name, grade_id')
        .eq('school_id', ctx.schoolId)
        .order('name'),
      supabase
        .from('academic_year')
        .select('id, label, is_current')
        .eq('school_id', ctx.schoolId)
        .order('label', { ascending: false }),
    ]);

  const students = await studentDirectory(ctx.schoolId, {
    q: searchParams.q,
    stageId: searchParams.stageId,
    gradeId: searchParams.gradeId,
    sectionId: searchParams.sectionId,
    academicYearId: searchParams.yearId,
    status: searchParams.status,
    finStatus: searchParams.fin,
    dueWithinDays: searchParams.due ? Number(searchParams.due) : undefined,
    unenrolled: searchParams.unenrolled === '1',
    missingPhone: searchParams.nophone === '1',
    sort: searchParams.sort,
  });

  // Counts over the filtered set. Summing decimal strings for a *display* total
  // is the one place JS touches money — it is never written back, and each
  // per-student figure is still derived in Postgres (Article II).
  const owing = students.filter((s) => Number(s.total_owed) > 0);
  const owedTotal = owing.reduce((sum, s) => sum + Number(s.total_owed), 0);
  const overdue = students.filter((s) => s.fin_status === 'overdue');
  const settled = students.filter((s) => s.fin_status === 'paid');
  const active = students.filter((s) => s.status === 'active');

  const kpis: SectionKpi[] = [
    { label: 'إجمالي الطلاب', value: String(students.length), icon: Users, tone: 'primary' },
    { label: 'طلاب نشطون', value: String(active.length), icon: UserCheck, tone: 'info' },
    {
      label: 'عليهم مستحقات',
      value: String(owing.length),
      icon: CircleDollarSign,
      tone: 'warning',
      hint: formatCurrency(owedTotal.toFixed(2)),
    },
    {
      label: 'متأخرو السداد',
      value: String(overdue.length),
      icon: AlertCircle,
      tone: overdue.length > 0 ? 'danger' : 'neutral',
    },
    {
      label: 'مسددون بالكامل',
      value: String(settled.length),
      icon: CheckCircle2,
      tone: 'success',
    },
  ];

  const exportQs = new URLSearchParams(
    Object.entries(searchParams).filter(([, v]) => v) as [string, string][],
  ).toString();

  return (
    <div dir="rtl" className="space-y-6">
      <PageHeader
        title="الطلاب"
        subtitle="إدارة بيانات الطلاب وحالتهم المالية"
        actions={
          <>
            <StudentFormDialog />
            <a
              href={`/students/export${exportQs ? `?${exportQs}` : ''}`}
              className="inline-flex h-10 items-center rounded-md border border-border bg-surface px-4 text-sm font-medium hover:bg-muted"
              data-testid="export-students"
            >
              تصدير CSV
            </a>
          </>
        }
      />

      <SectionKpis items={kpis} className="lg:grid-cols-5" />

      <StudentFilters
        stages={(stages ?? []).map((s) => ({ id: s.id, label: s.label_ar }))}
        grades={(grades ?? []).map((g) => ({
          id: g.id,
          label: g.label_ar,
          parentId: g.stage_id,
        }))}
        sections={(sections ?? []).map((s) => ({
          id: s.id,
          label: s.name,
          parentId: s.grade_id,
        }))}
        years={(years ?? []).map((y) => ({
          id: y.id,
          label: y.is_current ? `${y.label} (الحالي)` : y.label,
        }))}
        values={searchParams as Record<string, string | undefined>}
      />

      <div className="md:hidden">
        <StudentsCardList students={students} />
      </div>
      <div className="hidden md:block">
        <StudentsTable data={students} />
      </div>
    </div>
  );
}

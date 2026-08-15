import { Card, CardContent } from '@erp/ui';
import { requireAuth } from '../../../../lib/auth/guard.js';
import { createSupabaseServerClient } from '../../../../lib/supabase/server.js';
import { receivablesAging, bucketTotals } from '../../../../lib/queries/receivables.js';
import { formatCurrency } from '../../../../lib/format/currency.js';
import { ReceivablesFilters } from '../../../../components/reports/receivables-filters.js';
import { ReceivablesTable } from '../../../../components/reports/receivables-table.js';
import { PageHeader } from '../../../../components/layout/index.js';

/** Receivables aging report (US5, T100). Filterable by stage/grade/section, with per-bucket totals. */
export default async function ReceivablesPage({
  searchParams,
}: {
  searchParams: { stageId?: string; gradeId?: string; sectionId?: string };
}) {
  const ctx = await requireAuth();
  if (!ctx.schoolId) {
    return (
      <div dir="rtl">
        <p className="text-gray-500">لا توجد مدرسة مرتبطة بهذا الحساب.</p>
      </div>
    );
  }

  const supabase = createSupabaseServerClient();
  const [{ data: stages }, { data: grades }, { data: sections }] = await Promise.all([
    supabase.from('stage').select('id, label_ar').order('ordinal'),
    supabase.from('grade').select('id, label_ar, stage_id').order('ordinal'),
    supabase.from('section').select('id, name, grade_id').eq('school_id', ctx.schoolId).order('name'),
  ]);

  const rows = await receivablesAging({
    schoolId: ctx.schoolId,
    stageId: searchParams.stageId,
    gradeId: searchParams.gradeId,
    sectionId: searchParams.sectionId,
  });
  const totals = bucketTotals(rows);

  return (
    <div dir="rtl" className="space-y-4">
      <PageHeader
        title="تقرير أعمار الديون"
        subtitle="المستحقات غير المسددة موزعة حسب مدة التأخير"
        actions={
          <a
            href={`/reports/receivables/export?${new URLSearchParams(searchParams as Record<string, string>).toString()}`}
            className="inline-flex h-10 items-center rounded-md border border-border bg-surface px-4 text-sm font-medium hover:bg-muted"
          >
            تصدير CSV
          </a>
        }
      />

      <ReceivablesFilters
        stages={stages ?? []}
        grades={grades ?? []}
        sections={sections ?? []}
        initial={searchParams}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-xs text-gray-500">الحالي</p>
            <p className="font-bold">{formatCurrency(String(totals.current))}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-xs text-gray-500">١-٣٠</p>
            <p className="font-bold">{formatCurrency(String(totals.b1_30))}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-xs text-gray-500">٣١-٦٠</p>
            <p className="font-bold">{formatCurrency(String(totals.b31_60))}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-xs text-gray-500">٦١-٩٠</p>
            <p className="font-bold">{formatCurrency(String(totals.b61_90))}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-xs text-gray-500">أكثر من ٩٠</p>
            <p className="font-bold">{formatCurrency(String(totals.b90_plus))}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-xs text-gray-500">الإجمالي</p>
            <p className="font-bold">{formatCurrency(String(totals.total))}</p>
          </CardContent>
        </Card>
      </div>

      <ReceivablesTable data={rows} />
    </div>
  );
}

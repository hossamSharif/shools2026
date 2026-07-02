import type { ColumnDef } from '@tanstack/react-table';
import { DataTable, Card, CardContent } from '@erp/ui';
import { requireAuth } from '../../../../lib/auth/guard.js';
import { createSupabaseServerClient } from '../../../../lib/supabase/server.js';
import { receivablesAging, bucketTotals, type ReceivableRow } from '../../../../lib/queries/receivables.js';
import { formatCurrency } from '../../../../lib/format/currency.js';
import { ReceivablesFilters } from '../../../../components/reports/receivables-filters.js';

const STATUS_LABEL_AR: Record<ReceivableRow['status'], string> = {
  active: 'نشط',
  withdrawn: 'منسحب',
  graduated: 'متخرج',
};

const columns: ColumnDef<ReceivableRow, unknown>[] = [
  { accessorKey: 'student_name', header: 'الطالب' },
  {
    accessorKey: 'status',
    header: 'الحالة',
    cell: (c) => STATUS_LABEL_AR[c.getValue() as ReceivableRow['status']],
  },
  { accessorKey: 'grade_label', header: 'الصف', cell: (c) => (c.getValue() as string) ?? '—' },
  { accessorKey: 'section_name', header: 'الشعبة', cell: (c) => (c.getValue() as string) ?? '—' },
  { accessorKey: 'current_amount', header: 'الحالي', cell: (c) => formatCurrency(String(c.getValue())) },
  { accessorKey: 'bucket_1_30', header: '١-٣٠ يوم', cell: (c) => formatCurrency(String(c.getValue())) },
  { accessorKey: 'bucket_31_60', header: '٣١-٦٠ يوم', cell: (c) => formatCurrency(String(c.getValue())) },
  { accessorKey: 'bucket_61_90', header: '٦١-٩٠ يوم', cell: (c) => formatCurrency(String(c.getValue())) },
  { accessorKey: 'bucket_90_plus', header: 'أكثر من ٩٠ يوم', cell: (c) => formatCurrency(String(c.getValue())) },
  { accessorKey: 'total_owed', header: 'الإجمالي', cell: (c) => formatCurrency(String(c.getValue())) },
];

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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">تقرير أعمار الديون</h1>
        <a
          href={`/reports/receivables/export?${new URLSearchParams(searchParams as Record<string, string>).toString()}`}
          className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
        >
          تصدير CSV
        </a>
      </div>

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

      <DataTable columns={columns} data={rows} emptyMessage="لا توجد مستحقات" />
    </div>
  );
}

import { createSupabaseServerClient } from '../../../../lib/supabase/server.js';
import { FeeStructureBuilder } from '../../../../components/settings/fee-structure-builder.js';

interface GradeRow {
  id: string;
  label_ar: string;
  ordinal: number;
}
interface YearRow {
  id: string;
  label: string;
}

/** Fee-structure builder: grade + year + fee items + installment schedule (US2). */
export default async function FeesPage() {
  const supabase = createSupabaseServerClient();
  const [{ data: grades }, { data: years }] = await Promise.all([
    supabase
      .from('grade')
      .select('id, label_ar, ordinal')
      .order('ordinal', { ascending: true })
      .returns<GradeRow[]>(),
    supabase
      .from('academic_year')
      .select('id, label')
      .order('created_at', { ascending: false })
      .returns<YearRow[]>(),
  ]);

  return (
    <div dir="rtl" className="space-y-4">
      <h1 className="text-2xl font-bold">هيكل الرسوم</h1>
      <FeeStructureBuilder
        grades={(grades ?? []).map((g) => ({ id: g.id, label: g.label_ar }))}
        years={years ?? []}
      />
    </div>
  );
}

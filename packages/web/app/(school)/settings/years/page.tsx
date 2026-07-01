import { createSupabaseServerClient } from '../../../../lib/supabase/server.js';
import { YearsManager } from '../../../../components/settings/years-manager.js';

interface YearRow {
  id: string;
  label: string;
  is_current: boolean;
  created_at: string;
}

/** Academic years list + create + mark-current (US2). */
export default async function YearsPage() {
  const supabase = createSupabaseServerClient();
  const { data } = await supabase
    .from('academic_year')
    .select('id, label, is_current, created_at')
    .order('created_at', { ascending: false })
    .returns<YearRow[]>();

  return (
    <div dir="rtl" className="space-y-4">
      <h1 className="text-2xl font-bold">السنوات الدراسية</h1>
      <YearsManager years={data ?? []} />
    </div>
  );
}

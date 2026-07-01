import { createSupabaseServerClient } from '../../../../lib/supabase/server.js';
import { AdjustmentForm } from '../../../../components/money/adjustment-form.js';

interface StudentRow {
  id: string;
  name: string;
}

/** Record a student-ledger adjustment (US4). */
export default async function NewAdjustmentPage() {
  const supabase = createSupabaseServerClient();
  const { data: students } = await supabase
    .from('student')
    .select('id, name')
    .order('name', { ascending: true })
    .returns<StudentRow[]>();

  return (
    <div dir="rtl" className="space-y-4">
      <h1 className="text-2xl font-bold">تسوية جديدة</h1>
      <AdjustmentForm students={(students ?? []).map((s) => ({ id: s.id, label: s.name }))} />
    </div>
  );
}

import { createSupabaseServerClient } from '../../../../lib/supabase/server.js';
import { GradeSections } from '../../../../components/settings/grade-sections.js';

interface GradeRow {
  id: string;
  label_ar: string;
  ordinal: number;
  stage_id: string;
}
interface SectionRow {
  id: string;
  name: string;
  grade_id: string;
}

/** Read-only fixed grades + per-grade sections create (US2). */
export default async function GradesPage() {
  const supabase = createSupabaseServerClient();

  const [{ data: grades }, { data: sections }] = await Promise.all([
    supabase
      .from('grade')
      .select('id, label_ar, ordinal, stage_id')
      .order('ordinal', { ascending: true })
      .returns<GradeRow[]>(),
    supabase.from('section').select('id, name, grade_id').returns<SectionRow[]>(),
  ]);

  const byGrade = new Map<string, SectionRow[]>();
  for (const s of sections ?? []) {
    const list = byGrade.get(s.grade_id) ?? [];
    list.push(s);
    byGrade.set(s.grade_id, list);
  }

  return (
    <div dir="rtl" className="space-y-4">
      <h1 className="text-2xl font-bold">الصفوف والشعب</h1>
      <div className="space-y-3">
        {(grades ?? []).map((g) => (
          <GradeSections key={g.id} grade={g} sections={byGrade.get(g.id) ?? []} />
        ))}
      </div>
    </div>
  );
}

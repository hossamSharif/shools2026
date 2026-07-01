import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '../../../../../lib/supabase/server.js';
import { EnrollForm } from '../../../../../components/students/enroll-form.js';

interface GradeRow {
  id: string;
  label_ar: string;
  ordinal: number;
}
interface SectionRow {
  id: string;
  name: string;
  grade_id: string;
}
interface YearRow {
  id: string;
  label: string;
}

/** Enroll a student — DB trigger generates installments (US2, FR-018). */
export default async function EnrollPage({ params }: { params: { studentId: string } }) {
  const supabase = createSupabaseServerClient();

  const { data: student } = await supabase
    .from('student')
    .select('id, name')
    .eq('id', params.studentId)
    .single<{ id: string; name: string }>();
  if (!student) notFound();

  const [{ data: grades }, { data: sections }, { data: years }] = await Promise.all([
    supabase
      .from('grade')
      .select('id, label_ar, ordinal')
      .order('ordinal', { ascending: true })
      .returns<GradeRow[]>(),
    supabase.from('section').select('id, name, grade_id').returns<SectionRow[]>(),
    supabase
      .from('academic_year')
      .select('id, label')
      .order('created_at', { ascending: false })
      .returns<YearRow[]>(),
  ]);

  return (
    <div dir="rtl" className="space-y-4">
      <h1 className="text-2xl font-bold">تسجيل الطالب — {student.name}</h1>
      <EnrollForm
        studentId={student.id}
        grades={(grades ?? []).map((g) => ({ id: g.id, label: g.label_ar }))}
        sections={sections ?? []}
        years={years ?? []}
      />
    </div>
  );
}

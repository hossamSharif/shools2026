import { createSupabaseServerClient } from '../../../lib/supabase/server.js';
import { StudentForm } from '../../../components/students/student-form.js';
import { StudentsTable, type StudentRow } from '../../../components/students/students-table.js';
import { StudentsCardList } from '../../../components/students/students-card-list.js';
import { Card, CardContent } from '@erp/ui';

/** Students list + create form (US2). */
export default async function StudentsPage() {
  const supabase = createSupabaseServerClient();
  const { data } = await supabase
    .from('student')
    .select('id, name, guardian_name, guardian_phone, status')
    .order('name', { ascending: true })
    .returns<StudentRow[]>();

  const students = data ?? [];

  return (
    <div dir="rtl" className="space-y-6">
      <h1 className="text-2xl font-bold">الطلاب</h1>

      <Card>
        <CardContent className="pt-6">
          <h2 className="mb-4 text-lg font-semibold">إضافة طالب</h2>
          <StudentForm />
        </CardContent>
      </Card>

      <div className="md:hidden">
        <StudentsCardList students={students} />
      </div>
      <div className="hidden md:block">
        <StudentsTable data={students} />
      </div>
    </div>
  );
}

import Link from 'next/link';
import { createSupabaseServerClient } from '../../../lib/supabase/server.js';
import { StudentForm } from '../../../components/students/student-form.js';
import { Card, CardContent } from '@erp/ui';

interface StudentRow {
  id: string;
  name: string;
  guardian_name: string | null;
  guardian_phone: string | null;
  status: 'active' | 'withdrawn' | 'graduated';
}

const STATUS_AR: Record<StudentRow['status'], string> = {
  active: 'نشط',
  withdrawn: 'منسحب',
  graduated: 'متخرج',
};

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

      <Card>
        <CardContent className="p-0">
          <table dir="rtl" className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-start font-semibold">الاسم</th>
                <th className="px-4 py-2 text-start font-semibold">ولي الأمر</th>
                <th className="px-4 py-2 text-start font-semibold">الهاتف</th>
                <th className="px-4 py-2 text-start font-semibold">الحالة</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {students.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-gray-400">
                    لا يوجد طلاب بعد
                  </td>
                </tr>
              ) : (
                students.map((s) => (
                  <tr key={s.id} className="border-t border-gray-100">
                    <td className="px-4 py-2">
                      <Link href={`/students/${s.id}`} className="text-emerald-600 hover:underline">
                        {s.name}
                      </Link>
                    </td>
                    <td className="px-4 py-2">{s.guardian_name ?? '—'}</td>
                    <td className="px-4 py-2">{s.guardian_phone ?? '—'}</td>
                    <td className="px-4 py-2">{STATUS_AR[s.status]}</td>
                    <td className="px-4 py-2 text-start">
                      <Link
                        href={`/students/${s.id}/enroll`}
                        className="text-emerald-600 hover:underline"
                      >
                        تسجيل
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

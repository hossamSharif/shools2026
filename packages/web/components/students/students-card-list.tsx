import Link from 'next/link';
import { Card, CardContent } from '@erp/ui';
import type { StudentRow } from './students-table.js';

const STATUS_AR: Record<StudentRow['status'], string> = {
  active: 'نشط',
  withdrawn: 'منسحب',
  graduated: 'متخرج',
};

/** Stacked-card fallback for the students list below `md`, where a 5-column
 * table is too cramped even with horizontal scroll. */
export function StudentsCardList({ students }: { students: StudentRow[] }) {
  if (students.length === 0) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-gray-400">لا يوجد طلاب بعد</CardContent>
      </Card>
    );
  }

  return (
    <ul className="space-y-3">
      {students.map((s) => (
        <li key={s.id}>
          <Card>
            <CardContent className="space-y-2 p-4">
              <Link href={`/students/${s.id}`} className="block font-semibold text-emerald-600">
                {s.name}
              </Link>
              <div className="grid grid-cols-2 gap-1 text-sm text-gray-600">
                <span>ولي الأمر: {s.guardian_name ?? '—'}</span>
                <span>الهاتف: {s.guardian_phone ?? '—'}</span>
                <span>الحالة: {STATUS_AR[s.status]}</span>
              </div>
              <Link
                href={`/students/${s.id}/enroll`}
                className="block w-full rounded-md border border-gray-300 py-2 text-center text-sm text-emerald-600"
              >
                تسجيل
              </Link>
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}

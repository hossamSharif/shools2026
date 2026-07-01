'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Select } from '@erp/ui';
import { enrollStudent } from '../../lib/actions/spine.js';

interface Option {
  id: string;
  label: string;
}
interface SectionRow {
  id: string;
  name: string;
  grade_id: string;
}

export function EnrollForm({
  studentId,
  grades,
  sections,
  years,
}: {
  studentId: string;
  grades: Option[];
  sections: SectionRow[];
  years: Option[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const [gradeId, setGradeId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [yearId, setYearId] = useState('');

  const gradeSections = useMemo(
    () => sections.filter((s) => s.grade_id === gradeId),
    [sections, gradeId],
  );

  const submit = () => {
    setError(null);
    setOk(false);
    if (!gradeId || !sectionId || !yearId) {
      setError('اختر الصف والشعبة والسنة الدراسية');
      return;
    }
    startTransition(async () => {
      try {
        await enrollStudent({
          student_id: studentId,
          grade_id: gradeId,
          section_id: sectionId,
          academic_year_id: yearId,
        });
        setOk(true);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'حدث خطأ');
      }
    });
  };

  return (
    <div dir="rtl" className="max-w-md space-y-4">
      <label className="block space-y-1">
        <span className="text-sm font-medium text-gray-700">الصف</span>
        <Select
          value={gradeId}
          onChange={(e) => {
            setGradeId(e.target.value);
            setSectionId('');
          }}
        >
          <option value="">اختر الصف</option>
          {grades.map((g) => (
            <option key={g.id} value={g.id}>
              {g.label}
            </option>
          ))}
        </Select>
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-medium text-gray-700">الشعبة</span>
        <Select value={sectionId} onChange={(e) => setSectionId(e.target.value)} disabled={!gradeId}>
          <option value="">اختر الشعبة</option>
          {gradeSections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-medium text-gray-700">السنة الدراسية</span>
        <Select value={yearId} onChange={(e) => setYearId(e.target.value)}>
          <option value="">اختر السنة</option>
          {years.map((y) => (
            <option key={y.id} value={y.id}>
              {y.label}
            </option>
          ))}
        </Select>
      </label>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {ok ? <p className="text-sm text-emerald-600">تم تسجيل الطالب</p> : null}
      <Button type="button" onClick={submit} disabled={pending}>
        {pending ? 'جارٍ التسجيل…' : 'تسجيل'}
      </Button>
    </div>
  );
}

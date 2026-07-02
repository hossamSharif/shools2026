'use client';

import { useRouter, usePathname } from 'next/navigation';
import { Select } from '@erp/ui';

interface Ref {
  id: string;
  label_ar?: string;
  name?: string;
  stage_id?: string;
  grade_id?: string;
}

/** Stage/grade/section filters for the receivables report (US5, T100). Client component — pushes searchParams. */
export function ReceivablesFilters({
  stages,
  grades,
  sections,
  initial,
}: {
  stages: Ref[];
  grades: Ref[];
  sections: Ref[];
  initial: { stageId?: string; gradeId?: string; sectionId?: string };
}) {
  const router = useRouter();
  const pathname = usePathname();

  function updateParam(key: 'stageId' | 'gradeId' | 'sectionId', value: string) {
    const params = new URLSearchParams({ ...initial } as Record<string, string>);
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div dir="rtl" className="flex flex-wrap gap-3">
      <Select
        defaultValue={initial.stageId ?? ''}
        onChange={(e) => updateParam('stageId', e.target.value)}
        className="max-w-xs"
      >
        <option value="">كل المراحل</option>
        {stages.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label_ar}
          </option>
        ))}
      </Select>
      <Select
        defaultValue={initial.gradeId ?? ''}
        onChange={(e) => updateParam('gradeId', e.target.value)}
        className="max-w-xs"
      >
        <option value="">كل الصفوف</option>
        {grades.map((g) => (
          <option key={g.id} value={g.id}>
            {g.label_ar}
          </option>
        ))}
      </Select>
      <Select
        defaultValue={initial.sectionId ?? ''}
        onChange={(e) => updateParam('sectionId', e.target.value)}
        className="max-w-xs"
      >
        <option value="">كل الشعب</option>
        {sections.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </Select>
    </div>
  );
}

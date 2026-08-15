'use client';

import { FilterBar, type FilterControl } from '../layout/index.js';

interface Ref {
  id: string;
  label: string;
  /** Parent key, so grade lists narrow to the chosen stage and sections to the grade. */
  parentId?: string | null;
}

/**
 * The students-list filter rail. Everything lives in the query string; the
 * server page re-reads it and calls `student_directory` with the same values,
 * so a filtered view is shareable and the KPI strip recomputes with it.
 *
 * Stage → grade → section cascade *client-side over the full reference lists*
 * (three fixed stages, twelve fixed grades, a handful of sections per school):
 * no extra round-trip is warranted, and selecting a parent clears its children
 * via `resets` so the URL can never hold a contradictory pair.
 */
export function StudentFilters({
  stages,
  grades,
  sections,
  years,
  values,
}: {
  stages: Ref[];
  grades: Ref[];
  sections: Ref[];
  years: Ref[];
  values: Record<string, string | undefined>;
}) {
  const stageId = values.stageId;
  const gradeId = values.gradeId;

  const visibleGrades = stageId ? grades.filter((g) => g.parentId === stageId) : grades;
  const visibleSections = gradeId ? sections.filter((s) => s.parentId === gradeId) : sections;

  const toOptions = (rows: Ref[]) => rows.map((r) => ({ value: r.id, label: r.label }));

  const controls: FilterControl[] = [
    { kind: 'select', key: 'stageId', placeholder: 'كل المراحل', options: toOptions(stages) },
    { kind: 'select', key: 'gradeId', placeholder: 'كل الصفوف', options: toOptions(visibleGrades) },
    {
      kind: 'select',
      key: 'sectionId',
      placeholder: 'كل الشعب',
      options: toOptions(visibleSections),
    },
    { kind: 'select', key: 'yearId', placeholder: 'كل الأعوام', options: toOptions(years) },
    {
      kind: 'select',
      key: 'status',
      placeholder: 'كل الحالات',
      options: [
        { value: 'active', label: 'نشط' },
        { value: 'withdrawn', label: 'منسحب' },
        { value: 'graduated', label: 'متخرج' },
      ],
    },
    {
      kind: 'select',
      key: 'fin',
      placeholder: 'كل الحالات المالية',
      options: [
        { value: 'overdue', label: 'متأخر السداد' },
        { value: 'partial', label: 'سداد جزئي' },
        { value: 'unpaid', label: 'لم يسدد' },
        { value: 'paid', label: 'مسدد بالكامل' },
      ],
    },
    {
      kind: 'select',
      key: 'due',
      placeholder: 'كل مواعيد الاستحقاق',
      options: [
        { value: '7', label: 'مستحق خلال ٧ أيام' },
        { value: '30', label: 'مستحق خلال ٣٠ يوماً' },
      ],
    },
    {
      kind: 'select',
      key: 'sort',
      placeholder: 'ترتيب حسب الاسم',
      options: [
        { value: 'owed_desc', label: 'الأكثر مديونية' },
        { value: 'oldest_overdue', label: 'الأقدم تأخراً' },
      ],
    },
    { kind: 'toggle', key: 'unenrolled', label: 'غير مسجّل' },
    { kind: 'toggle', key: 'nophone', label: 'بدون رقم هاتف' },
  ];

  return (
    <FilterBar
      values={values}
      controls={controls}
      search={{ key: 'q', placeholder: 'ابحث بالاسم أو ولي الأمر أو الهاتف…' }}
      resets={{ stageId: ['gradeId', 'sectionId'], gradeId: ['sectionId'] }}
    />
  );
}

'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus } from 'lucide-react';
import { Button, Dialog, DialogContent, DialogTitle, Input, Select } from '@erp/ui';
import { registerStudent } from '../../lib/actions/spine.js';

/**
 * "Register + enroll" in one step (spec 002, T068, FR-018a), for writers whose
 * `students.write` is limited to some stages: they cannot create a student
 * without a class, so the student and the enrollment are saved together by
 * `register_student`. The grade picker lists only the caller's stages; Postgres
 * checks the stage again and refuses anything outside it.
 */

interface GradeOption {
  id: string;
  label: string;
  stageId: string;
}
interface SectionOption {
  id: string;
  label: string;
  gradeId: string;
}
interface YearOption {
  id: string;
  label: string;
  isCurrent: boolean;
}

const FormSchema = z.object({
  name: z.string().trim().min(1, 'اسم الطالب مطلوب').max(200),
  guardian_name: z.string().max(200).optional(),
  guardian_phone: z
    .string()
    .regex(/^\+?\d{7,15}$/, 'رقم هاتف غير صالح')
    .optional()
    .or(z.literal('')),
  grade_id: z.string().min(1, 'اختر الصف'),
  section_id: z.string().min(1, 'اختر الشعبة'),
  academic_year_id: z.string().min(1, 'اختر السنة الدراسية'),
});
type FormValues = z.input<typeof FormSchema>;

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      {children}
      {error ? <span className="block text-xs text-red-600">{error}</span> : null}
    </label>
  );
}

export function RegisterStudentDialog({
  grades,
  sections,
  years,
  allowedStages,
}: {
  grades: GradeOption[];
  sections: SectionOption[];
  years: YearOption[];
  /** The caller's `students.write` stages; null = every stage. */
  allowedStages: string[] | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const scopedGrades = useMemo(
    () => (allowedStages ? grades.filter((g) => allowedStages.includes(g.stageId)) : grades),
    [grades, allowedStages],
  );
  const currentYear = years.find((y) => y.isCurrent)?.id ?? '';

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      name: '',
      guardian_name: '',
      guardian_phone: '',
      grade_id: '',
      section_id: '',
      academic_year_id: currentYear,
    },
  });

  const gradeId = watch('grade_id');
  const gradeSections = useMemo(
    () => sections.filter((s) => s.gradeId === gradeId),
    [sections, gradeId],
  );

  const onSubmit = handleSubmit((v) => {
    setServerError(null);
    startTransition(async () => {
      try {
        const { id } = await registerStudent({
          name: v.name,
          guardian_name: v.guardian_name || undefined,
          guardian_phone: v.guardian_phone || undefined,
          grade_id: v.grade_id,
          section_id: v.section_id,
          academic_year_id: v.academic_year_id,
        });
        reset();
        setOpen(false);
        router.push(`/students/${id}`);
      } catch (e) {
        setServerError(e instanceof Error ? e.message : 'حدث خطأ');
      }
    });
  });

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)} data-testid="register-student">
        <Plus className="h-4 w-4" aria-hidden />
        تسجيل طالب جديد
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl" data-testid="register-student-dialog">
          <DialogTitle>تسجيل طالب وإلحاقه بصف</DialogTitle>
          <form
            onSubmit={onSubmit}
            dir="rtl"
            className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2"
          >
            <Field label="اسم الطالب" error={errors.name?.message}>
              <Input {...register('name')} placeholder="الاسم الكامل" />
            </Field>
            <Field label="اسم ولي الأمر" error={errors.guardian_name?.message}>
              <Input {...register('guardian_name')} />
            </Field>
            <Field label="هاتف ولي الأمر" error={errors.guardian_phone?.message}>
              <Input {...register('guardian_phone')} inputMode="tel" placeholder="+2499XXXXXXXX" />
            </Field>
            <Field label="السنة الدراسية" error={errors.academic_year_id?.message}>
              <Select {...register('academic_year_id')}>
                <option value="">اختر السنة</option>
                {years.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.isCurrent ? `${y.label} (الحالي)` : y.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="الصف" error={errors.grade_id?.message}>
              <Select
                {...register('grade_id', {
                  onChange: () => setValue('section_id', ''),
                })}
              >
                <option value="">اختر الصف</option>
                {scopedGrades.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="الشعبة" error={errors.section_id?.message}>
              <Select {...register('section_id')} disabled={!gradeId}>
                <option value="">اختر الشعبة</option>
                {gradeSections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="space-y-2 sm:col-span-2">
              {serverError ? <p className="text-sm text-red-600">{serverError}</p> : null}
              <Button type="submit" disabled={pending}>
                {pending ? 'جارٍ التسجيل…' : 'تسجيل الطالب'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

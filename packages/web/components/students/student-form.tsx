'use client';

import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { Button, Input, Select } from '@erp/ui';
import { upsertStudent } from '../../lib/actions/spine.js';

const FormSchema = z.object({
  name: z.string().min(1, 'اسم الطالب مطلوب'),
  guardian_name: z.string().optional(),
  guardian_phone: z
    .string()
    .regex(/^\+?\d{7,15}$/, 'رقم هاتف غير صالح')
    .optional()
    .or(z.literal('')),
  status: z.enum(['active', 'withdrawn', 'graduated']).default('active'),
});
type FormValues = z.input<typeof FormSchema>;

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      {children}
      {error ? <span className="block text-xs text-red-600">{error}</span> : null}
    </label>
  );
}

export interface StudentFormProps {
  student?: {
    id: string;
    name: string;
    guardian_name: string | null;
    guardian_phone: string | null;
    status: 'active' | 'withdrawn' | 'graduated';
  };
}

/** Create/edit student (US2). Pass `student` to edit; omit to create. */
export function StudentForm({ student }: StudentFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      name: student?.name ?? '',
      guardian_name: student?.guardian_name ?? '',
      guardian_phone: student?.guardian_phone ?? '',
      status: student?.status ?? 'active',
    },
  });

  const onSubmit = handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      try {
        await upsertStudent({
          id: student?.id,
          name: values.name,
          guardian_name: values.guardian_name || undefined,
          guardian_phone: values.guardian_phone || undefined,
          status: values.status,
        });
        if (!student) reset({ name: '', guardian_name: '', guardian_phone: '', status: 'active' });
        router.refresh();
      } catch (e) {
        setServerError(e instanceof Error ? e.message : 'حدث خطأ');
      }
    });
  });

  return (
    <form onSubmit={onSubmit} className="grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
      <Field label="اسم الطالب" error={errors.name?.message}>
        <Input {...register('name')} placeholder="الاسم الكامل" />
      </Field>
      <Field label="اسم ولي الأمر" error={errors.guardian_name?.message}>
        <Input {...register('guardian_name')} />
      </Field>
      <Field label="هاتف ولي الأمر" error={errors.guardian_phone?.message}>
        <Input {...register('guardian_phone')} inputMode="tel" placeholder="+2499XXXXXXXX" />
      </Field>
      <Field label="الحالة" error={errors.status?.message}>
        <Select {...register('status')}>
          <option value="active">نشط</option>
          <option value="withdrawn">منسحب</option>
          <option value="graduated">متخرج</option>
        </Select>
      </Field>
      <div className="sm:col-span-2 space-y-2">
        {serverError ? <p className="text-sm text-red-600">{serverError}</p> : null}
        <Button type="submit" disabled={pending}>
          {pending ? 'جارٍ الحفظ…' : student ? 'حفظ التعديلات' : 'إضافة الطالب'}
        </Button>
      </div>
    </form>
  );
}

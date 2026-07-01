'use client';

import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { Button, Input } from '@erp/ui';
import { createSchoolWithSubscription } from '../../lib/actions/schools.js';

const FormSchema = z
  .object({
    name: z.string().min(1, 'اسم المدرسة مطلوب'),
    period_start: z.string().min(1, 'بداية الاشتراك مطلوبة'),
    period_end: z.string().min(1, 'نهاية الاشتراك مطلوبة'),
    grace_days: z.coerce.number().int().min(0).default(14),
  })
  .refine((v) => v.period_end >= v.period_start, {
    message: 'نهاية الاشتراك يجب أن تكون بعد بدايته',
    path: ['period_end'],
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

/** Create-school + set-subscription form (react-hook-form + Zod). */
export function SchoolForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: { grace_days: 14 },
  });

  const onSubmit = handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      try {
        await createSchoolWithSubscription({
          name: values.name,
          period_start: values.period_start,
          period_end: values.period_end,
          grace_days: Number(values.grace_days),
        });
        router.push('/schools');
        router.refresh();
      } catch (e) {
        setServerError(e instanceof Error ? e.message : 'حدث خطأ');
      }
    });
  });

  return (
    <form onSubmit={onSubmit} className="max-w-md space-y-4">
      <Field label="اسم المدرسة" error={errors.name?.message}>
        <Input {...register('name')} placeholder="مثال: مدارس النيل" />
      </Field>
      <Field label="بداية الاشتراك" error={errors.period_start?.message}>
        <Input type="date" {...register('period_start')} />
      </Field>
      <Field label="نهاية الاشتراك" error={errors.period_end?.message}>
        <Input type="date" {...register('period_end')} />
      </Field>
      <Field label="أيام السماح" error={errors.grace_days?.message}>
        <Input type="number" min={0} {...register('grace_days')} />
      </Field>

      {serverError ? <p className="text-sm text-red-600">{serverError}</p> : null}

      <Button type="submit" disabled={pending}>
        {pending ? 'جارٍ الحفظ…' : 'إنشاء المدرسة'}
      </Button>
    </form>
  );
}

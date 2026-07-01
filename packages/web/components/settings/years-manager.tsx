'use client';

import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { Button, Input, Card, CardHeader, CardTitle, CardContent } from '@erp/ui';
import { createAcademicYear, setCurrentYear } from '../../lib/actions/spine.js';

const FormSchema = z.object({
  label: z.string().min(1, 'اسم السنة الدراسية مطلوب'),
  is_current: z.boolean().default(false),
});
type FormValues = z.input<typeof FormSchema>;

interface YearRow {
  id: string;
  label: string;
  is_current: boolean;
  created_at: string;
}

export function YearsManager({ years }: { years: YearRow[] }) {
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
    defaultValues: { is_current: false },
  });

  const onSubmit = handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      try {
        await createAcademicYear({ label: values.label, is_current: !!values.is_current });
        reset({ label: '', is_current: false });
        router.refresh();
      } catch (e) {
        setServerError(e instanceof Error ? e.message : 'حدث خطأ');
      }
    });
  });

  const markCurrent = (id: string) => {
    setServerError(null);
    startTransition(async () => {
      try {
        await setCurrentYear(id);
        router.refresh();
      } catch (e) {
        setServerError(e instanceof Error ? e.message : 'حدث خطأ');
      }
    });
  };

  return (
    <div dir="rtl" className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>إضافة سنة دراسية</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="max-w-md space-y-4">
            <label className="block space-y-1">
              <span className="text-sm font-medium text-gray-700">اسم السنة الدراسية</span>
              <Input {...register('label')} placeholder="مثال: 2025 / 2026" />
              {errors.label ? (
                <span className="block text-xs text-red-600">{errors.label.message}</span>
              ) : null}
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" {...register('is_current')} />
              تعيين كسنة حالية
            </label>
            {serverError ? <p className="text-sm text-red-600">{serverError}</p> : null}
            <Button type="submit" disabled={pending}>
              {pending ? 'جارٍ الحفظ…' : 'إضافة'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <table dir="rtl" className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-start font-semibold">السنة</th>
                <th className="px-4 py-2 text-start font-semibold">الحالة</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {years.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-gray-400">
                    لا توجد سنوات دراسية بعد
                  </td>
                </tr>
              ) : (
                years.map((y) => (
                  <tr key={y.id} className="border-t border-gray-100">
                    <td className="px-4 py-2">{y.label}</td>
                    <td className="px-4 py-2">
                      {y.is_current ? (
                        <span className="text-emerald-600">حالية</span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-start">
                      {y.is_current ? null : (
                        <button
                          type="button"
                          onClick={() => markCurrent(y.id)}
                          disabled={pending}
                          className="text-emerald-600 hover:underline disabled:opacity-50"
                        >
                          تعيين كحالية
                        </button>
                      )}
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

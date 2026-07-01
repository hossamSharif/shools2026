'use client';

import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { Button, Input, Select, Card, CardHeader, CardTitle, CardContent } from '@erp/ui';
import { createAccount } from '../../lib/actions/spine.js';

const FormSchema = z
  .object({
    name: z.string().min(1, 'اسم الحساب مطلوب'),
    type: z.enum(['cash', 'bank']),
    account_number: z.string().optional(),
    opening_balance: z.string().default('0'),
  })
  .refine((v) => v.type === 'cash' || !!v.account_number, {
    message: 'رقم الحساب مطلوب للحسابات البنكية',
    path: ['account_number'],
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

export function AccountForm() {
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
    defaultValues: { type: 'cash', opening_balance: '0' },
  });

  const onSubmit = handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      try {
        await createAccount({
          name: values.name,
          type: values.type,
          account_number: values.account_number || undefined,
          opening_balance: values.opening_balance || '0',
        });
        reset({ name: '', type: 'cash', account_number: '', opening_balance: '0' });
        router.refresh();
      } catch (e) {
        setServerError(e instanceof Error ? e.message : 'حدث خطأ');
      }
    });
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>إضافة حساب</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="اسم الحساب" error={errors.name?.message}>
            <Input {...register('name')} placeholder="مثال: الصندوق الرئيسي" />
          </Field>
          <Field label="النوع" error={errors.type?.message}>
            <Select {...register('type')}>
              <option value="cash">نقدي</option>
              <option value="bank">بنكي</option>
            </Select>
          </Field>
          <Field label="رقم الحساب" error={errors.account_number?.message}>
            <Input {...register('account_number')} placeholder="للحسابات البنكية" />
          </Field>
          <Field label="الرصيد الافتتاحي" error={errors.opening_balance?.message}>
            <Input {...register('opening_balance')} inputMode="decimal" placeholder="0.00" />
          </Field>
          <div className="sm:col-span-2 space-y-2">
            {serverError ? <p className="text-sm text-red-600">{serverError}</p> : null}
            <Button type="submit" disabled={pending}>
              {pending ? 'جارٍ الحفظ…' : 'إضافة الحساب'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

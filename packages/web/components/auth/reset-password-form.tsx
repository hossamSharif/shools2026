'use client';

import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { Button, Input } from '@erp/ui';
import { createSupabaseBrowserClient } from '../../lib/supabase/client.js';

const Schema = z
  .object({
    next: z.string().min(8, 'كلمة المرور يجب ألا تقل عن 8 أحرف'),
    confirm: z.string().min(1, 'تأكيد كلمة المرور مطلوب'),
  })
  .refine((v) => v.next === v.confirm, {
    message: 'كلمتا المرور غير متطابقتين',
    path: ['confirm'],
  });
type Values = z.input<typeof Schema>;

/**
 * Set a new password using the recovery session established by the emailed
 * reset link (via /auth/confirm). No current password needed — the recovery
 * session is the proof of identity.
 */
export function ResetPasswordForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(Schema) });

  const onSubmit = handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.updateUser({ password: values.next });
      if (error) {
        setServerError('تعذر تعيين كلمة المرور. قد يكون الرابط منتهي الصلاحية.');
        return;
      }
      setDone(true);
      router.push('/');
      router.refresh();
    });
  });

  return (
    <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4">
      <label className="block space-y-1">
        <span className="text-sm font-medium text-gray-700">كلمة المرور الجديدة</span>
        <Input type="password" autoComplete="new-password" {...register('next')} />
        {errors.next ? (
          <span className="block text-xs text-red-600">{errors.next.message}</span>
        ) : null}
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium text-gray-700">تأكيد كلمة المرور الجديدة</span>
        <Input type="password" autoComplete="new-password" {...register('confirm')} />
        {errors.confirm ? (
          <span className="block text-xs text-red-600">{errors.confirm.message}</span>
        ) : null}
      </label>
      {serverError ? <p className="text-sm text-red-600">{serverError}</p> : null}
      {done ? <p className="text-sm text-green-600">تم تعيين كلمة المرور. جارٍ التحويل…</p> : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? 'جارٍ الحفظ…' : 'تعيين كلمة المرور'}
      </Button>
    </form>
  );
}

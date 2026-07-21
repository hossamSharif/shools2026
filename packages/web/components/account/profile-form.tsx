'use client';

import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { Button, Input, Card, CardHeader, CardTitle, CardContent } from '@erp/ui';
import { updateDisplayName } from '../../lib/actions/profile.js';
import { createSupabaseBrowserClient } from '../../lib/supabase/client.js';

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

// ── Display name ─────────────────────────────────────────────────────────────
const NameSchema = z.object({ display_name: z.string().trim().min(1, 'الاسم مطلوب') });
type NameValues = z.input<typeof NameSchema>;

function DisplayNameCard({ displayName }: { displayName: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<NameValues>({
    resolver: zodResolver(NameSchema),
    defaultValues: { display_name: displayName },
  });

  const onSubmit = handleSubmit((values) => {
    setServerError(null);
    setDone(false);
    startTransition(async () => {
      try {
        await updateDisplayName({ display_name: values.display_name });
        setDone(true);
        router.refresh();
      } catch (e) {
        setServerError(e instanceof Error ? e.message : 'حدث خطأ');
      }
    });
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>الملف الشخصي</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="max-w-md space-y-4">
          <Field label="الاسم المعروض" error={errors.display_name?.message}>
            <Input {...register('display_name')} />
          </Field>
          {serverError ? <p className="text-sm text-red-600">{serverError}</p> : null}
          {done ? <p className="text-sm text-green-600">تم حفظ الاسم</p> : null}
          <Button type="submit" disabled={pending}>
            {pending ? 'جارٍ الحفظ…' : 'حفظ'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// ── Password ─────────────────────────────────────────────────────────────────
const PasswordSchema = z
  .object({
    current: z.string().min(1, 'كلمة المرور الحالية مطلوبة'),
    next: z.string().min(8, 'كلمة المرور الجديدة يجب ألا تقل عن 8 أحرف'),
    confirm: z.string().min(1, 'تأكيد كلمة المرور مطلوب'),
  })
  .refine((v) => v.next === v.confirm, {
    message: 'كلمتا المرور غير متطابقتين',
    path: ['confirm'],
  });
type PasswordValues = z.input<typeof PasswordSchema>;

function PasswordCard({ email }: { email: string }) {
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PasswordValues>({ resolver: zodResolver(PasswordSchema) });

  const onSubmit = handleSubmit((values) => {
    setServerError(null);
    setDone(false);
    startTransition(async () => {
      const supabase = createSupabaseBrowserClient();
      // Re-verify the current password before allowing the change.
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email,
        password: values.current,
      });
      if (verifyError) {
        setServerError('كلمة المرور الحالية غير صحيحة');
        return;
      }
      const { error: updateError } = await supabase.auth.updateUser({ password: values.next });
      if (updateError) {
        setServerError('تعذر تغيير كلمة المرور');
        return;
      }
      reset({ current: '', next: '', confirm: '' });
      setDone(true);
    });
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>تغيير كلمة المرور</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="max-w-md space-y-4">
          {/* Hidden username field so password managers associate the credential. */}
          <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
          <Field label="كلمة المرور الحالية" error={errors.current?.message}>
            <Input type="password" autoComplete="current-password" {...register('current')} />
          </Field>
          <Field label="كلمة المرور الجديدة" error={errors.next?.message}>
            <Input type="password" autoComplete="new-password" {...register('next')} />
          </Field>
          <Field label="تأكيد كلمة المرور الجديدة" error={errors.confirm?.message}>
            <Input type="password" autoComplete="new-password" {...register('confirm')} />
          </Field>
          {serverError ? <p className="text-sm text-red-600">{serverError}</p> : null}
          {done ? <p className="text-sm text-green-600">تم تغيير كلمة المرور</p> : null}
          <Button type="submit" disabled={pending}>
            {pending ? 'جارٍ التغيير…' : 'تغيير كلمة المرور'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// ── Email ────────────────────────────────────────────────────────────────────
const EmailSchema = z.object({ email: z.string().email('بريد إلكتروني غير صالح') });
type EmailValues = z.input<typeof EmailSchema>;

function EmailCard({ email }: { email: string }) {
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<EmailValues>({
    resolver: zodResolver(EmailSchema),
    defaultValues: { email },
  });

  const onSubmit = handleSubmit((values) => {
    setServerError(null);
    setSent(false);
    startTransition(async () => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.updateUser({ email: values.email });
      if (error) {
        setServerError('تعذر تغيير البريد الإلكتروني');
        return;
      }
      setSent(true);
    });
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>تغيير البريد الإلكتروني</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="max-w-md space-y-4">
          <Field label="البريد الإلكتروني" error={errors.email?.message}>
            <Input type="email" autoComplete="email" {...register('email')} />
          </Field>
          {serverError ? <p className="text-sm text-red-600">{serverError}</p> : null}
          {sent ? (
            <p className="text-sm text-green-600">
              تم إرسال رابط التأكيد إلى بريدك الإلكتروني الجديد. لن يتغير البريد حتى تؤكده.
            </p>
          ) : null}
          <Button type="submit" disabled={pending}>
            {pending ? 'جارٍ الإرسال…' : 'تغيير البريد الإلكتروني'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

/** Own-profile management: display name, password, and email (Supabase auth). */
export function ProfileForm({ displayName, email }: { displayName: string; email: string }) {
  return (
    <div className="space-y-6">
      <DisplayNameCard displayName={displayName} />
      <PasswordCard email={email} />
      <EmailCard email={email} />
    </div>
  );
}

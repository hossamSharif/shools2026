'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Button, Input } from '@erp/ui';
import { createSupabaseBrowserClient } from '../../lib/supabase/client.js';

/**
 * Request a password-reset link (forgot-password). Sends a recovery email whose
 * link lands on /auth/confirm (type=recovery → /reset-password). Delivery needs
 * SMTP + the token_hash recovery email template configured on the project.
 */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const supabase = createSupabaseBrowserClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/confirm?next=/reset-password`,
      });
      if (resetError) {
        setError('تعذر إرسال رابط إعادة التعيين');
        return;
      }
      setSent(true);
    });
  };

  if (sent) {
    return (
      <div className="w-full max-w-sm space-y-4 text-center">
        <p className="text-sm text-green-600">
          إذا كان هذا البريد مسجلاً، فسيصلك رابط لإعادة تعيين كلمة المرور.
        </p>
        <Link href="/login" className="text-sm text-blue-600 hover:underline">
          العودة إلى تسجيل الدخول
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4">
      <label className="block space-y-1">
        <span className="text-sm font-medium text-gray-700">البريد الإلكتروني</span>
        <Input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </label>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? 'جارٍ الإرسال…' : 'إرسال رابط إعادة التعيين'}
      </Button>
      <Link href="/login" className="block text-center text-sm text-blue-600 hover:underline">
        العودة إلى تسجيل الدخول
      </Link>
    </form>
  );
}

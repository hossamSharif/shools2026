'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Input } from '@erp/ui';
import { createSupabaseBrowserClient } from '../../lib/supabase/client.js';

/** Sign-in form (email + password) wired to Supabase auth. */
export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const supabase = createSupabaseBrowserClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError('البريد الإلكتروني أو كلمة المرور غير صحيحة');
        return;
      }
      router.push('/');
      router.refresh();
    });
  };

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
      <label className="block space-y-1">
        <span className="text-sm font-medium text-gray-700">كلمة المرور</span>
        <Input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </label>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? 'جارٍ الدخول…' : 'تسجيل الدخول'}
      </Button>
      <Link
        href="/forgot-password"
        className="block text-center text-sm text-blue-600 hover:underline"
      >
        نسيت كلمة المرور؟
      </Link>
    </form>
  );
}

'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button, Input } from '@erp/ui';
import { acceptInvitation } from '../../lib/actions/invite-accept.js';
import { createSupabaseBrowserClient } from '../../lib/supabase/client.js';

/** Set a name and password for an invited staff account (FR-026). */
export function AcceptInviteForm({ token }: { token: string }) {
  const t = useTranslations('invite');
  const router = useRouter();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showForgot, setShowForgot] = useState(false);
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setShowForgot(false);
    if (name.trim().length < 2) return setError(t('nameTooShort'));
    if (password.length < 10) return setError(t('passwordTooShort'));
    if (password !== confirm) return setError(t('passwordMismatch'));
    startTransition(async () => {
      const r = await acceptInvitation({ token, display_name: name.trim(), password });
      if (!r.ok) {
        if (r.error === 'PASSWORD_SET_FAILED') {
          setError(t('passwordSetFailed'));
          setShowForgot(true);
        } else {
          setError(t('invalid'));
        }
        return;
      }
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.signOut();
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: r.email,
        password,
      });
      if (signInErr) {
        setError(t('passwordSetFailed'));
        setShowForgot(true);
        return;
      }
      router.push('/');
      router.refresh();
    });
  };

  return (
    <form onSubmit={submit} className="w-full max-w-sm space-y-4">
      <label className="block space-y-1">
        <span className="text-sm font-medium text-gray-700">{t('displayName')}</span>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          required
        />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium text-gray-700">{t('password')}</span>
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          required
        />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium text-gray-700">{t('confirm')}</span>
        <Input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          required
        />
      </label>
      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}
      {showForgot ? (
        <Link href="/forgot-password" className="block text-sm text-blue-600 hover:underline">
          {t('forgotLink')}
        </Link>
      ) : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? t('accepting') : t('accept')}
      </Button>
    </form>
  );
}

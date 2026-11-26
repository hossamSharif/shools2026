'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@erp/ui';
import { resendInvitation, revokeInvitation } from '../../lib/actions/users.js';
import type { InvitationRow } from '../../lib/queries/users.js';

/** Pending invitations with resend / revoke (revoking is always allowed, FR-023). */
export function InvitationsList({
  invitations,
  canManage,
  writesAllowed,
}: {
  invitations: InvitationRow[];
  canManage: boolean;
  writesAllowed: boolean;
}) {
  const t = useTranslations('users');
  const tr = useTranslations('roles');
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const rows = invitations.filter((i) => i.state === 'pending');

  const run = (fn: () => Promise<void>) => {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'حدث خطأ');
      }
    });
  };

  return (
    <section className="space-y-2" aria-label={t('pendingTitle')}>
      <h2 className="text-lg font-semibold">{t('pendingTitle')}</h2>
      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('noPending')}</p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border bg-surface">
          {rows.map((i) => (
            <li
              key={i.id}
              className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"
            >
              <div>
                <span dir="ltr" className="font-medium">
                  {i.email}
                </span>
                <span className="ms-2 rounded bg-amber-100 px-2 py-0.5 text-xs">
                  {t('status.invited')}
                </span>
                <p className="text-xs text-muted-foreground">
                  {(i.roles ?? []).map((r) => tr(r)).join('، ')} · {t('expiresAt')}{' '}
                  {i.expires_at_label}
                </p>
              </div>
              {canManage ? (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending || !writesAllowed}
                    onClick={() => run(() => resendInvitation({ invitation_id: i.id }))}
                  >
                    {t('resend')}
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={pending}
                    onClick={() => run(() => revokeInvitation({ invitation_id: i.id }))}
                  >
                    {t('revoke')}
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

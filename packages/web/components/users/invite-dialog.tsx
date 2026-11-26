'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button, Dialog, DialogContent, DialogTitle, DialogTrigger, Input } from '@erp/ui';
import type { StageScope, StaffRole } from '@erp/shared/schemas';
import { inviteStaff } from '../../lib/actions/users.js';
import type { StageOption } from '../../lib/queries/users.js';
import { RolePicker } from './role-picker.js';

/** Invite a staff member by email with one or more roles (FR-025/026). */
export function InviteDialog({ stages }: { stages: StageOption[] }) {
  const t = useTranslations('invite');
  const tu = useTranslations('users');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [roles, setRoles] = useState<StaffRole[]>([]);
  const [stageScope, setStageScope] = useState<StageScope>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        await inviteStaff({ email, roles, stage_scope: stageScope });
        setOpen(false);
        setEmail('');
        setRoles([]);
        setStageScope({});
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'حدث خطأ');
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>{tu('invite')}</Button>
      </DialogTrigger>
      <DialogContent aria-describedby={undefined}>
        <DialogTitle>{t('title')}</DialogTitle>
        <form onSubmit={submit} className="mt-4 space-y-4">
          <label className="block space-y-1">
            <span className="text-sm font-medium text-gray-700">{t('email')}</span>
            <Input
              type="email"
              dir="ltr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <RolePicker
            roles={roles}
            stageScope={stageScope}
            stages={stages}
            onChange={(n) => {
              setRoles(n.roles);
              setStageScope(n.stageScope);
            }}
          />
          {error ? (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={pending || roles.length === 0}>
              {pending ? t('sending') : t('send')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

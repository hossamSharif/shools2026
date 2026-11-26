'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button, Sheet, SheetContent, SheetTitle, SheetTrigger } from '@erp/ui';
import { isStaffRole } from '@erp/shared/access';
import type { StageScope, StaffRole } from '@erp/shared/schemas';
import { deactivateUser, reactivateUser, setUserRoles } from '../../lib/actions/users.js';
import type { SchoolUserRow, StageOption } from '../../lib/queries/users.js';
import { RolePicker } from './role-picker.js';

/**
 * Edit a staff member's roles, stages and status. In grace/locked the database
 * refuses grants (WRITES_GATED) but still allows deactivation, role removal and
 * stage narrowing (FR-023); reactivation is disabled here for clarity.
 */
export function EditUserSheet({
  user,
  stages,
  writesAllowed,
}: {
  user: SchoolUserRow;
  stages: StageOption[];
  writesAllowed: boolean;
}) {
  const t = useTranslations('users');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const initialRoles = (user.roles ?? []).filter(isStaffRole) as StaffRole[];
  const [roles, setRoles] = useState<StaffRole[]>(initialRoles);
  const [stageScope, setStageScope] = useState<StageScope>((user.stage_scope ?? {}) as StageScope);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<void>) => {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        setOpen(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'حدث خطأ');
      }
    });
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" aria-label={`${t('edit')}: ${user.display_name}`}>
          {t('edit')}
        </Button>
      </SheetTrigger>
      <SheetContent aria-describedby={undefined} className="w-96 overflow-y-auto">
        <SheetTitle>{user.display_name}</SheetTitle>
        <p className="mt-1 text-sm text-muted-foreground" dir="ltr">
          {user.email}
        </p>
        <div className="mt-4 space-y-4">
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
          <Button
            className="w-full"
            disabled={pending || roles.length === 0}
            onClick={() =>
              run(() => setUserRoles({ user_id: user.user_id, roles, stage_scope: stageScope }))
            }
          >
            {t('save')}
          </Button>
          {user.status === 'deactivated' ? (
            <Button
              variant="secondary"
              className="w-full"
              disabled={pending || !writesAllowed}
              onClick={() => run(() => reactivateUser({ user_id: user.user_id }))}
            >
              {t('reactivate')}
            </Button>
          ) : (
            <Button
              variant="destructive"
              className="w-full"
              disabled={pending}
              onClick={() => run(() => deactivateUser({ user_id: user.user_id }))}
            >
              {t('deactivate')}
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

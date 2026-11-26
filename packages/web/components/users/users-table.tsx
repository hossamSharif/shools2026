'use client';

import { useTranslations } from 'next-intl';
import type { SchoolUserRow, StageOption } from '../../lib/queries/users.js';
import { EditUserSheet } from './edit-user-sheet.js';

/** School users with roles, stage scope and status (US3, T058). */
export function UsersTable({
  users,
  stages,
  currentUserId,
  canManage,
  writesAllowed,
}: {
  users: SchoolUserRow[];
  stages: StageOption[];
  currentUserId: string;
  canManage: boolean;
  writesAllowed: boolean;
}) {
  const t = useTranslations('users');
  const tr = useTranslations('roles');
  const stageLabel = (id: string) => stages.find((s) => s.id === id)?.label ?? id;

  return (
    <div className="overflow-x-auto rounded-md border border-border bg-surface">
      <table className="w-full text-sm">
        <thead className="bg-muted text-start">
          <tr>
            <th className="p-3 text-start">{t('colName')}</th>
            <th className="p-3 text-start">{t('colEmail')}</th>
            <th className="p-3 text-start">{t('colRoles')}</th>
            <th className="p-3 text-start">{t('colStages')}</th>
            <th className="p-3 text-start">{t('colStatus')}</th>
            {canManage ? <th className="p-3 text-start">{t('colActions')}</th> : null}
          </tr>
        </thead>
        <tbody>
          {users.map((u) => {
            const scope = (u.stage_scope ?? {}) as Record<string, string[]>;
            const scoped = Object.entries(scope).filter(([, ids]) => ids.length > 0);
            return (
              <tr key={u.user_id} className="border-t border-border">
                <td className="p-3 font-medium">
                  {u.display_name}
                  {u.user_id === currentUserId ? (
                    <span className="ms-2 text-xs text-muted-foreground">({t('you')})</span>
                  ) : null}
                </td>
                <td className="p-3" dir="ltr">
                  {u.email}
                </td>
                <td className="p-3">
                  <div className="flex flex-wrap gap-1">
                    {u.is_portal ? (
                      <span className="rounded bg-muted px-2 py-0.5 text-xs">
                        {t('portalUser')}
                      </span>
                    ) : (
                      (u.roles ?? []).map((r) => (
                        <span
                          key={r}
                          className="rounded bg-primary/10 px-2 py-0.5 text-xs text-primary"
                        >
                          {tr(r)}
                        </span>
                      ))
                    )}
                  </div>
                </td>
                <td className="p-3 text-xs">
                  {scoped.length === 0
                    ? t('schoolWide')
                    : scoped
                        .map(([r, ids]) => `${tr(r)}: ${ids.map(stageLabel).join('، ')}`)
                        .join(' — ')}
                </td>
                <td className="p-3">{t(`status.${u.status}`)}</td>
                {canManage ? (
                  <td className="p-3">
                    {u.user_id !== currentUserId && !u.is_portal ? (
                      <EditUserSheet user={u} stages={stages} writesAllowed={writesAllowed} />
                    ) : null}
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

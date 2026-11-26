import { getTranslations } from 'next-intl/server';
import { Card, CardContent, CardHeader, CardTitle } from '@erp/ui';
import { requirePermission } from '../../../../lib/auth/guard.js';
import { getLifecycleInfo, writesAllowed } from '../../../../lib/auth/lifecycle-gate.js';
import { rolePermissions } from '../../../../lib/queries/permissions.js';
import { PageHeader } from '../../../../components/layout/index.js';
import { UsersTabs } from '../../../../components/users/users-tabs.js';
import { PermissionSwitch } from '../../../../components/users/permission-switch.js';

/**
 * Permissions per role (spec 002, US5, T072). `users.read` opens it (school
 * admin, principal); the switches need `users.manage`. Each role shows its
 * fixed default rights (read-only, module keys not yet released marked) and
 * its optional switches. Only catalogue switches exist here: nothing else can
 * be granted, and Postgres refuses it anyway (NOT_GRANTABLE).
 */
export default async function PermissionsPage() {
  const ctx = await requirePermission('users.read');
  const [t, tRoles] = await Promise.all([getTranslations('permissions'), getTranslations('roles')]);
  const canManage = ctx.permissions.has('users.manage');
  const [{ state }, roles] = await Promise.all([getLifecycleInfo(ctx.schoolId), rolePermissions()]);
  const allowGrants = writesAllowed(state);

  return (
    <div dir="rtl" className="space-y-6">
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <UsersTabs active="permissions" />

      {!canManage ? (
        <p role="status" className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
          {t('viewOnly')}
        </p>
      ) : !allowGrants ? (
        <p role="status" className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          {t('readOnlyBanner')}
        </p>
      ) : null}

      {roles.map((r) => {
        const roleLabel = tRoles(r.role);
        return (
          <Card key={r.role} data-testid={`role-section-${r.role}`}>
            <CardHeader>
              <CardTitle>{roleLabel}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-6 md:grid-cols-2">
              <section aria-label={`${roleLabel}: ${t('switchesHeading')}`} className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-900">{t('switchesHeading')}</h3>
                {r.switches.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t('noSwitches')}</p>
                ) : (
                  <ul className="space-y-3">
                    {r.switches.map((s) => (
                      <li
                        key={s.key}
                        className="flex items-start justify-between gap-4 rounded-md border border-border p-3"
                      >
                        <div className="space-y-0.5">
                          <p className="text-sm font-medium text-gray-900">{s.label}</p>
                          <p className="text-xs text-muted-foreground">
                            {s.defaultEnabled ? t('defaultOn') : t('defaultOff')}
                            {s.changedAtLabel
                              ? ` · ${t('changedAt', { at: s.changedAtLabel })}`
                              : ''}
                          </p>
                        </div>
                        <PermissionSwitch
                          role={r.role}
                          permissionKey={s.key}
                          label={t('switchLabel', { role: roleLabel, permission: s.label })}
                          enabled={s.enabled}
                          canManage={canManage}
                          allowGrants={allowGrants}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section aria-label={`${roleLabel}: ${t('defaultsHeading')}`} className="space-y-3">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">{t('defaultsHeading')}</h3>
                  <p className="text-xs text-muted-foreground">{t('defaultsHint')}</p>
                </div>
                {r.defaults.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t('noDefaults')}</p>
                ) : (
                  <ul className="flex flex-wrap gap-2">
                    {r.defaults.map((d) => (
                      <li
                        key={d.key}
                        className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-gray-700"
                      >
                        {d.label}
                        {!d.enforced ? (
                          <span className="ms-1 text-muted-foreground">({t('notEnforced')})</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

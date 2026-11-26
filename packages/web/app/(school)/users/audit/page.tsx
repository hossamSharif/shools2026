import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Card, CardContent } from '@erp/ui';
import { requirePermission } from '../../../../lib/auth/guard.js';
import {
  accessAuditLabels,
  listAccessAudit,
  listSchoolUsers,
} from '../../../../lib/queries/users.js';
import {
  ACCESS_AUDIT_ACTION_KEYS,
  auditChange,
  auditSummary,
  type AccessAuditActionKey,
} from '../../../../lib/format/access-audit.js';
import { PageHeader } from '../../../../components/layout/index.js';
import { UsersTabs } from '../../../../components/users/users-tabs.js';
import { AccessAuditFilters } from '../../../../components/users/access-audit-filters.js';

/**
 * Access audit (spec 002, US6, T077). `users.read` (school admin, principal).
 * Newest first, 50 a page, keyset-paged through `?before=<id>`; the filters are
 * query-string params shared with the CSV export. Times are Africa/Khartoum.
 * The log cannot be changed from anywhere (AUDIT_IMMUTABLE in Postgres).
 */
export const dynamic = 'force-dynamic';

const PAGE = 50;

interface SearchParams {
  user?: string;
  action?: string;
  from?: string;
  to?: string;
  before?: string;
}

export default async function AccessAuditPage({ searchParams }: { searchParams: SearchParams }) {
  await requirePermission('users.read');
  const t = await getTranslations('accessAudit');
  const action = (ACCESS_AUDIT_ACTION_KEYS as readonly string[]).includes(searchParams.action ?? '')
    ? (searchParams.action as AccessAuditActionKey)
    : undefined;
  const beforeId = /^\d+$/.test(searchParams.before ?? '')
    ? Number(searchParams.before)
    : undefined;
  const filters = {
    userId: searchParams.user,
    action,
    from: searchParams.from,
    to: searchParams.to,
  };

  const [rows, users, labels] = await Promise.all([
    listAccessAudit({ ...filters, beforeId, limit: PAGE }),
    listSchoolUsers(),
    accessAuditLabels(),
  ]);

  const qs = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({
      user: searchParams.user,
      action,
      from: searchParams.from,
      to: searchParams.to,
      ...extra,
    }))
      if (v) p.set(k, v);
    const s = p.toString();
    return s ? `?${s}` : '';
  };

  return (
    <div dir="rtl" className="space-y-6">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        actions={
          <a
            href={`/users/audit/export${qs({})}`}
            className="inline-flex h-10 items-center rounded-md border border-border bg-surface px-4 text-sm font-medium hover:bg-muted"
            data-testid="export-access-audit"
          >
            {t('export')}
          </a>
        }
      />
      <UsersTabs active="audit" />

      <AccessAuditFilters
        users={users.map((u) => ({ id: u.user_id, label: u.display_name }))}
        actions={ACCESS_AUDIT_ACTION_KEYS.map((a) => ({ id: a, label: labels.action(a) }))}
        values={{ ...filters, action }}
        labels={{
          user: t('filterUser'),
          action: t('filterAction'),
          from: t('filterFrom'),
          to: t('filterTo'),
        }}
      />

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm" data-testid="access-audit-table">
            <thead className="bg-muted/50">
              <tr>
                {[t('colTime'), t('colActor'), t('colTarget'), t('colAction'), t('colChange')].map(
                  (h) => (
                    <th key={h} className="px-4 py-2 text-start font-semibold text-gray-700">
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                    {t('empty')}
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const a = r.action as AccessAuditActionKey;
                  const before = (r.before ?? {}) as Record<string, unknown>;
                  const after = (r.after ?? {}) as Record<string, unknown>;
                  return (
                    <tr key={r.id} className="border-t border-border align-top">
                      <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">
                        {r.occurred_at_label}
                      </td>
                      <td className="px-4 py-2">{r.actor_name ?? t('system')}</td>
                      <td className="px-4 py-2">{r.target_name ?? r.target_email ?? '—'}</td>
                      <td className="px-4 py-2 font-medium">
                        {auditSummary(a, before, after, labels)}
                      </td>
                      <td className="px-4 py-2 text-gray-700">
                        {auditChange(a, before, after, labels)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <nav className="flex justify-between text-sm">
        {beforeId ? (
          <Link href={`/users/audit${qs({})}`} className="text-primary hover:underline">
            {t('newest')}
          </Link>
        ) : (
          <span />
        )}
        {rows.length === PAGE ? (
          <Link
            href={`/users/audit${qs({ before: String(rows[rows.length - 1]!.id) })}`}
            className="text-primary hover:underline"
            data-testid="access-audit-older"
          >
            {t('older')}
          </Link>
        ) : null}
      </nav>
    </div>
  );
}

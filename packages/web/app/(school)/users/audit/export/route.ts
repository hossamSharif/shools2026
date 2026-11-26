import { NextResponse } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { hasPermission, requireAuth } from '../../../../../lib/auth/guard.js';
import {
  accessAuditLabels,
  listAccessAudit,
  type AccessAuditFilters,
  type AccessAuditRow,
} from '../../../../../lib/queries/users.js';
import { accessAuditToCsv } from '../../../../../lib/export/access-audit-export.js';
import {
  ACCESS_AUDIT_ACTION_KEYS,
  type AccessAuditActionKey,
} from '../../../../../lib/format/access-audit.js';

/**
 * CSV export of the access audit (spec 002, US6, T078, FR-033). Same filters as
 * the page; pages through `list_access_audit` (500 a page) until the end.
 */
const PAGE = 500;
const MAX_ROWS = 50_000;

export async function GET(request: Request) {
  const ctx = await requireAuth();
  // Route handlers answer 403 instead of redirecting (contracts/web-routes.md).
  if (!hasPermission(ctx, 'users.read')) {
    return NextResponse.json({ error: 'FORBIDDEN_PERMISSION' }, { status: 403 });
  }
  const p = new URL(request.url).searchParams;
  const action = p.get('action') ?? '';
  const filters: AccessAuditFilters = {
    userId: p.get('user') || undefined,
    action: (ACCESS_AUDIT_ACTION_KEYS as readonly string[]).includes(action)
      ? (action as AccessAuditActionKey)
      : undefined,
    from: p.get('from') || undefined,
    to: p.get('to') || undefined,
  };

  const rows: AccessAuditRow[] = [];
  let beforeId: number | undefined;
  for (;;) {
    const page = await listAccessAudit({ ...filters, beforeId, limit: PAGE });
    rows.push(...page);
    if (page.length < PAGE || rows.length >= MAX_ROWS) break;
    beforeId = page[page.length - 1]!.id;
  }

  const [labels, t] = await Promise.all([accessAuditLabels(), getTranslations('accessAudit')]);
  return new NextResponse(accessAuditToCsv(rows, labels, t('system')), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="access-audit.csv"',
    },
  });
}

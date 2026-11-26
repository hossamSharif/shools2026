/**
 * Readable Arabic text for access-audit rows (spec 002, US6), shared by the
 * audit page and its CSV export. Pure: every label comes in through `labels`,
 * so the server pages pass next-intl strings and the catalogue's Arabic names.
 * The payload shapes are the ones the 0044/0046 functions write.
 */

export const ACCESS_AUDIT_ACTION_KEYS = [
  'invitation_sent',
  'invitation_accepted',
  'invitation_revoked',
  'invitation_expired',
  'role_added',
  'role_removed',
  'stage_scope_changed',
  'user_deactivated',
  'user_reactivated',
  'optional_permission_changed',
] as const;
export type AccessAuditActionKey = (typeof ACCESS_AUDIT_ACTION_KEYS)[number];

export interface AuditLabels {
  action: (a: AccessAuditActionKey) => string;
  role: (r: string) => string;
  stage: (id: string) => string;
  permission: (key: string) => string;
  field: (f: 'roles' | 'stages' | 'status' | 'state' | 'permission' | 'email') => string;
  userStatus: (s: string) => string;
  invitationState: (s: string) => string;
  on: string;
  off: string;
  allStages: string;
  none: string;
}

type Payload = Record<string, unknown>;

const list = (xs: string[], none: string) => (xs.length ? xs.join('، ') : none);
const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);

function stagesText(v: unknown, l: AuditLabels): string {
  const ids = arr(v);
  return ids.length ? ids.map(l.stage).join('، ') : l.allStages;
}

function scopeText(scope: unknown, l: AuditLabels): string {
  if (!scope || typeof scope !== 'object') return '';
  return Object.entries(scope as Record<string, unknown>)
    .filter(([, ids]) => arr(ids).length)
    .map(([role, ids]) => `${l.role(role)} (${stagesText(ids, l)})`)
    .join('، ');
}

/** "إضافة دور: المدير الأكاديمي" — the action, plus the role or permission it concerns. */
export function auditSummary(
  action: AccessAuditActionKey,
  before: Payload,
  after: Payload,
  l: AuditLabels,
): string {
  const label = l.action(action);
  const role = (after.role ?? before.role) as string | undefined;
  if (action === 'optional_permission_changed') {
    const key = String(after.key ?? before.key ?? '');
    return `${label}: ${role ? `${l.role(role)} — ` : ''}${l.permission(key)}`;
  }
  if (
    (action === 'role_added' || action === 'role_removed' || action === 'stage_scope_changed') &&
    role
  )
    return `${label}: ${l.role(role)}`;
  return label;
}

/** The before and after values, each as one readable line (empty when not applicable). */
export function auditSides(
  action: AccessAuditActionKey,
  before: Payload,
  after: Payload,
  l: AuditLabels,
): { field: string; before: string; after: string } {
  const roles = (p: Payload) => list(arr(p.roles).map(l.role), l.none);
  switch (action) {
    case 'invitation_sent':
    case 'invitation_accepted': {
      const scope = scopeText(after.stage_scope, l);
      return {
        field: l.field('roles'),
        before: '',
        after: roles(after) + (scope ? ` — ${l.field('stages')}: ${scope}` : ''),
      };
    }
    case 'invitation_revoked':
    case 'invitation_expired':
      return {
        field: l.field('state'),
        before: l.invitationState(String(before.state ?? '')),
        after: l.invitationState(String(after.state ?? '')),
      };
    case 'role_added':
    case 'role_removed':
      return { field: l.field('roles'), before: roles(before), after: roles(after) };
    case 'stage_scope_changed':
      return {
        field: l.field('stages'),
        before: stagesText(before.stages, l),
        after: stagesText(after.stages, l),
      };
    case 'user_deactivated':
    case 'user_reactivated':
      return {
        field: l.field('status'),
        before: l.userStatus(String(before.status ?? '')),
        after: l.userStatus(String(after.status ?? '')),
      };
    case 'optional_permission_changed':
      return {
        field: l.field('permission'),
        before: before.enabled ? l.on : l.off,
        after: after.enabled ? l.on : l.off,
      };
  }
}

/** "الأدوار: معلم ← معلم، شؤون الطلاب" */
export function auditChange(
  action: AccessAuditActionKey,
  before: Payload,
  after: Payload,
  l: AuditLabels,
): string {
  const s = auditSides(action, before, after, l);
  return s.before ? `${s.field}: ${s.before} ← ${s.after}` : `${s.field}: ${s.after}`;
}

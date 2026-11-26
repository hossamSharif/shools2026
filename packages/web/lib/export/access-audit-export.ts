import type { AccessAuditRow } from '../queries/users.js';
import {
  auditSides,
  auditSummary,
  type AccessAuditActionKey,
  type AuditLabels,
} from '../format/access-audit.js';

/**
 * CSV of the access audit (spec 002, US6, FR-033). UTF-8 with a BOM, Arabic
 * headers, Africa/Khartoum times (already formatted on the rows). Same escaping
 * convention as `students-export.ts`.
 */
export const ACCESS_AUDIT_CSV_HEADERS = [
  'التاريخ',
  'المنفّذ',
  'المستخدم المستهدف',
  'الإجراء',
  'قبل',
  'بعد',
] as const;

function escapeCsv(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function accessAuditToCsv(rows: AccessAuditRow[], l: AuditLabels, system: string): string {
  const lines = [ACCESS_AUDIT_CSV_HEADERS.join(',')];
  for (const r of rows) {
    const action = r.action as AccessAuditActionKey;
    const before = (r.before ?? {}) as Record<string, unknown>;
    const after = (r.after ?? {}) as Record<string, unknown>;
    const s = auditSides(action, before, after, l);
    lines.push(
      [
        r.occurred_at_label,
        r.actor_name ?? system,
        r.target_name ?? r.target_email ?? '',
        auditSummary(action, before, after, l),
        s.before ? `${s.field}: ${s.before}` : '',
        `${s.field}: ${s.after}`,
      ]
        .map((v) => escapeCsv(String(v ?? '')))
        .join(','),
    );
  }
  return `﻿${lines.join('\n')}`;
}

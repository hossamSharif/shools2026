import { createSupabaseServerClient } from '../supabase/server.js';
import { getTranslations } from 'next-intl/server';
import { fromZonedTime } from 'date-fns-tz';
import { formatDateTime, SCHOOL_TZ } from '../format/date.js';
import type { AccessAuditActionKey, AuditLabels } from '../format/access-audit.js';
import type { Database } from '@erp/database/types';

/** Read models for the users screens (spec 002, T057). RPC-only: token_hash never leaves the DB. */

type Fn = Database['public']['Functions'];
export type SchoolUserRow = Fn['list_school_users']['Returns'][number] & {
  created_at_label: string;
  deactivated_at_label: string | null;
};
export type InvitationRow = Fn['list_invitations']['Returns'][number] & {
  expires_at_label: string;
  created_at_label: string;
};

export async function listSchoolUsers(): Promise<SchoolUserRow[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.rpc('list_school_users');
  if (error) throw new Error(error.message);
  return (data ?? []).map((u) => ({
    ...u,
    created_at_label: formatDateTime(u.created_at),
    deactivated_at_label: u.deactivated_at ? formatDateTime(u.deactivated_at) : null,
  }));
}

export async function listInvitations(): Promise<InvitationRow[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.rpc('list_invitations');
  if (error) throw new Error(error.message);
  return (data ?? []).map((i) => ({
    ...i,
    expires_at_label: formatDateTime(i.expires_at),
    created_at_label: formatDateTime(i.created_at),
  }));
}

export interface StageOption {
  id: string;
  label: string;
}

export async function listStages(): Promise<StageOption[]> {
  const supabase = createSupabaseServerClient();
  const { data } = await supabase.from('stage').select('id, label_ar').order('ordinal');
  return (data ?? []).map((s) => ({ id: s.id, label: s.label_ar }));
}

// ── Access audit (spec 002, US6, T077) ──────────────────────────────────────

export type AccessAuditRow = Fn['list_access_audit']['Returns'][number] & {
  occurred_at_label: string;
};

export interface AccessAuditFilters {
  userId?: string;
  action?: AccessAuditActionKey;
  /** Africa/Khartoum calendar dates, `YYYY-MM-DD`, both inclusive. */
  from?: string;
  to?: string;
  beforeId?: number;
  limit?: number;
}

const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** A Khartoum calendar date to the UTC instant its day starts (`days` later when given). */
export function khartoumDayStartUtc(date: string, days = 0): string {
  const start = fromZonedTime(`${date}T00:00:00`, SCHOOL_TZ);
  return new Date(start.getTime() + days * 86_400_000).toISOString();
}

export async function listAccessAudit(f: AccessAuditFilters = {}): Promise<AccessAuditRow[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.rpc('list_access_audit', {
    p_user_id: f.userId || undefined,
    p_action: f.action || undefined,
    p_from: isDate(f.from) ? khartoumDayStartUtc(f.from!) : undefined,
    // The end date is inclusive on screen; the function's bound is exclusive.
    p_to: isDate(f.to) ? khartoumDayStartUtc(f.to!, 1) : undefined,
    p_before_id: f.beforeId,
    p_limit: f.limit ?? 50,
  });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({ ...r, occurred_at_label: formatDateTime(r.occurred_at) }));
}

/** Labels for `lib/format/access-audit.ts`, from next-intl and the catalogue. */
export async function accessAuditLabels(): Promise<AuditLabels> {
  const supabase = createSupabaseServerClient();
  const [t, tRoles, tUsers, stages, perms] = await Promise.all([
    getTranslations('accessAudit'),
    getTranslations('roles'),
    getTranslations('users'),
    listStages(),
    supabase.from('permission').select('key, label_ar'),
  ]);
  const stage = new Map(stages.map((s) => [s.id, s.label]));
  const perm = new Map((perms.data ?? []).map((p) => [p.key, p.label_ar]));
  const safe = (fn: (k: string) => string, k: string) => {
    try {
      return fn(k);
    } catch {
      return k;
    }
  };
  return {
    action: (a) => t(`actions.${a}`),
    role: (r) => safe((k) => tRoles(k as never), r),
    stage: (id) => stage.get(id) ?? id,
    permission: (k) => perm.get(k) ?? k,
    field: (f) => t(`fields.${f}`),
    userStatus: (s) => safe((k) => tUsers(`status.${k}` as never), s),
    invitationState: (s) => safe((k) => t(`states.${k}` as never), s),
    on: t('on'),
    off: t('off'),
    allStages: t('allStages'),
    none: t('none'),
  };
}

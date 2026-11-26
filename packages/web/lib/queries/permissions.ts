import { createSupabaseServerClient } from '../supabase/server.js';
import { formatDateTime } from '../format/date.js';
import type { Database } from '@erp/database/types';

/**
 * Read models for the permissions screen (spec 002, US5, T072). The role
 * defaults come from the catalogue tables (readable by every signed-in user);
 * the optional switches and this school's values come from
 * `optional_permission_matrix()` (users.read, checked in Postgres).
 */

type UserRole = Database['public']['Enums']['user_role'];

export interface DefaultRight {
  key: string;
  label: string;
  /** False for module keys whose module is not released yet. */
  enforced: boolean;
}

export interface OptionalSwitch {
  key: string;
  label: string;
  defaultEnabled: boolean;
  enabled: boolean;
  changedAtLabel: string | null;
}

export interface RolePermissions {
  role: UserRole;
  defaults: DefaultRight[];
  switches: OptionalSwitch[];
}

/** Staff roles shown on the screen, in display order. */
export const PERMISSION_SCREEN_ROLES: UserRole[] = [
  'school_admin',
  'principal',
  'student_affairs',
  'teacher',
  'accountant',
  'viewer',
];

export async function rolePermissions(): Promise<RolePermissions[]> {
  const supabase = createSupabaseServerClient();
  const [defaults, catalogue, matrix] = await Promise.all([
    supabase.from('role_permission_default').select('role, permission_key'),
    supabase.from('permission').select('key, label_ar, enforced'),
    supabase.rpc('optional_permission_matrix'),
  ]);
  for (const r of [defaults, catalogue, matrix]) if (r.error) throw new Error(r.error.message);

  const perm = new Map((catalogue.data ?? []).map((p) => [p.key, p]));
  return PERMISSION_SCREEN_ROLES.map((role) => ({
    role,
    defaults: (defaults.data ?? [])
      .filter((d) => d.role === role)
      .map((d) => ({
        key: d.permission_key,
        label: perm.get(d.permission_key)?.label_ar ?? d.permission_key,
        enforced: perm.get(d.permission_key)?.enforced ?? true,
      }))
      .sort(
        (a, b) => Number(b.enforced) - Number(a.enforced) || a.label.localeCompare(b.label, 'ar'),
      ),
    switches: (matrix.data ?? [])
      .filter((m) => m.role === role)
      .map((m) => ({
        key: m.permission_key,
        label: m.label_ar,
        defaultEnabled: m.default_enabled,
        enabled: m.enabled,
        changedAtLabel: m.changed_at ? formatDateTime(m.changed_at) : null,
      })),
  }));
}

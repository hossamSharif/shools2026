import { describe, expect, it } from 'vitest';
import { OPTIONAL_PERMISSIONS, PERMISSION_KEYS, ROLE_DEFAULTS, ROLES } from '@erp/shared/access';
import { getServiceClient, INTEGRATION_ENV_READY } from '../test-helpers/supabase.js';

/**
 * The database catalogue equals the shared vocabulary (tasks T027): migration
 * 0035's seed and packages/shared/src/access/keys.ts must never drift.
 */
const d = INTEGRATION_ENV_READY ? describe : describe.skip;

d('permission catalogue = @erp/shared/access', () => {
  const service = getServiceClient()!;

  it('permission rows match PERMISSION_KEYS (enforced, stage_scopable)', async () => {
    const { data, error } = await service
      .from('permission')
      .select('key, module, action, enforced, stage_scopable');
    expect(error).toBeNull();
    const db = new Map((data ?? []).map((r) => [r.key as string, r]));
    expect(db.size).toBe(PERMISSION_KEYS.length);
    for (const k of PERMISSION_KEYS) {
      const row = db.get(k.key);
      expect(row, k.key).toBeDefined();
      expect(row).toMatchObject({
        module: k.module,
        action: k.action,
        enforced: k.enforced,
        stage_scopable: k.stageScopable,
      });
    }
  });

  it('role_permission_default equals the D cells', async () => {
    const { data, error } = await service
      .from('role_permission_default')
      .select('role, permission_key');
    expect(error).toBeNull();
    const db = new Set((data ?? []).map((r) => `${r.role}:${r.permission_key}`));
    const want = new Set(ROLES.flatMap((role) => ROLE_DEFAULTS[role].map((k) => `${role}:${k}`)));
    expect([...db].sort()).toEqual([...want].sort());
  });

  it('optional_permission equals OPTIONAL_PERMISSIONS', async () => {
    const { data, error } = await service
      .from('optional_permission')
      .select('role, permission_key, default_enabled');
    expect(error).toBeNull();
    const db = (data ?? []).map((r) => `${r.role}:${r.permission_key}:${r.default_enabled}`).sort();
    const want = OPTIONAL_PERMISSIONS.map((o) => `${o.role}:${o.key}:${o.defaultEnabled}`).sort();
    expect(db).toEqual(want);
  });

  it('the invariant trigger refuses a never-grantable default (FR-011)', async () => {
    const { error } = await service
      .from('role_permission_default')
      .insert({ role: 'teacher', permission_key: 'finance.read' });
    expect(error?.message).toContain('NOT_GRANTABLE');
  });

  it('the invariant trigger refuses a never-grantable optional switch', async () => {
    const { error } = await service
      .from('optional_permission')
      .insert({
        role: 'principal',
        permission_key: 'finance.read',
        default_enabled: false,
        label_ar: 'x',
      });
    expect(error?.message).toContain('NOT_GRANTABLE');
  });
});

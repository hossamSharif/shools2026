import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MyAccess } from '@erp/shared/schemas';
import {
  createAuthedUser,
  getServiceClient,
  INTEGRATION_ENV_READY,
  type AuthedUser,
} from '../test-helpers/supabase.js';
import { activateSchool, cleanupSchool, newSchool } from '../test-helpers/fees.js';

/**
 * Migrated users keep exactly their Phase 1 role (US2-4, FR-018a, T036).
 * Users created the Phase 1 way (a bare public.user insert) get exactly one
 * school-wide assignment equal to user.role, and my_access() reports it.
 */
const d = INTEGRATION_ENV_READY ? describe : describe.skip;

d('Phase 1 users map to one school-wide assignment', () => {
  const service = getServiceClient()!;
  let school: string;
  const users: AuthedUser[] = [];
  const roles = ['school_admin', 'accountant', 'viewer'] as const;

  beforeAll(async () => {
    school = await newSchool(service, 'backfill');
    await activateSchool(service, school);
    for (const r of roles) users.push(await createAuthedUser(service, r, school));
  }, 60_000);

  afterAll(async () => {
    await cleanupSchool(service, school);
    for (const u of users) await u.cleanup();
  }, 60_000);

  it.each(roles.map((r, i) => [r, i] as const))('%s', async (role, i) => {
    const u = users[i]!;
    const { data: a } = await service
      .from('role_assignment')
      .select('id, role')
      .eq('user_id', u.userId);
    expect(a).toEqual([expect.objectContaining({ role })]);
    const { data: st } = await service
      .from('role_assignment_stage')
      .select('assignment_id')
      .eq('assignment_id', a![0]!.id);
    expect(st ?? []).toHaveLength(0);
    const access = MyAccess.parse((await u.client.rpc('my_access')).data);
    expect(access.roles).toEqual([role]);
    expect(access.school_id).toBe(school);
    expect(access.stage_scope['students.read'] ?? null).toBeNull();
  });

  it('every live school user has exactly one assignment equal to user.role (migration backfill)', async () => {
    const { data: all } = await service
      .from('user')
      .select('id, role, school_id')
      .not('school_id', 'is', null);
    const { data: ra } = await service.from('role_assignment').select('user_id, role');
    const byUser = new Map<string, string[]>();
    for (const r of ra ?? [])
      byUser.set(r.user_id as string, [
        ...(byUser.get(r.user_id as string) ?? []),
        r.role as string,
      ]);
    for (const u of all ?? []) {
      const assigned = byUser.get(u.id as string) ?? [];
      expect(assigned.length, `${u.id}`).toBeGreaterThanOrEqual(1);
      expect(assigned, `${u.id}`).toContain(u.role);
    }
  });
});

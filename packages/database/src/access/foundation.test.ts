import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MyAccess } from '@erp/shared/schemas';
import {
  ACCESS_EXPECTATIONS,
  FIXTURE_PROFILES,
  FIXTURE_USERS,
  effectiveKeys,
} from '@erp/shared/access';
import {
  getServiceClient,
  INTEGRATION_ENV_READY,
  createAuthedStaff,
} from '../test-helpers/supabase.js';
import { buildAccessFixture, type AccessFixture } from './fixture.js';

/**
 * Foundation of role-aware access (migrations 0033–0037, tasks T022).
 *
 * Integration test (Article X): real Supabase, every call with the user's own
 * session. Skips when the integration env is unset.
 */
const d = INTEGRATION_ENV_READY ? describe : describe.skip;

function errText(e: { message?: string; details?: string | null } | null): string {
  return e ? `${e.message ?? ''} ${e.details ?? ''}` : '';
}

d('access foundation (0033–0037)', () => {
  const service = getServiceClient()!;
  let fx: AccessFixture;

  beforeAll(async () => {
    fx = await buildAccessFixture(service);
  }, 120_000);

  afterAll(async () => {
    await fx?.cleanup();
  }, 120_000);

  describe('my_access()', () => {
    it.each(FIXTURE_USERS.filter((u) => u !== 'superAdmin'))(
      '%s gets its roles and effective permissions',
      async (u) => {
        const { data, error } = await fx.users[u].client.rpc('my_access');
        expect(error).toBeNull();
        const access = MyAccess.parse(data);
        const profile = FIXTURE_PROFILES[u];
        expect([...access.roles].sort()).toEqual([...profile.roles].sort());
        expect(new Set(access.permissions)).toEqual(new Set(effectiveKeys(profile)));
        expect(access.status).toBe('active');
        expect(access.school_id).toBe(profile.school === 'B' ? fx.schoolB : fx.schoolA);
        expect(access.is_staff).toBe(
          !profile.roles.every((r) => r === 'guardian' || r === 'student'),
        );
        expect(access.is_super_admin).toBe(false);
      },
    );

    it('super-admin: no school, no keys', async () => {
      const { data, error } = await fx.users.superAdmin.client.rpc('my_access');
      expect(error).toBeNull();
      const access = MyAccess.parse(data);
      expect(access.roles).toEqual(['super_admin']);
      expect(access.school_id).toBeNull();
      expect(access.permissions).toEqual([]);
      expect(access.is_super_admin).toBe(true);
    });

    it('matches the matrix: teacherSa holds the union of both roles', async () => {
      const c = fx.users.teacherSa.client;
      const [w, l, f] = await Promise.all([
        c.rpc('has_perm', { p_key: 'students.write' }),
        c.rpc('has_perm', { p_key: 'students.read_limited' }),
        c.rpc('has_perm', { p_key: 'finance.read' }),
      ]);
      expect([w.data, l.data, f.data]).toEqual([true, true, false]);
      expect(ACCESS_EXPECTATIONS.teacherSa.money_event.read).toBe('none');
    });
  });

  describe('perm_scope()', () => {
    it('is [Primary] for principalPrimary and null (school-wide) for principal', async () => {
      const scoped = await fx.users.principalPrimary.client.rpc('perm_scope', {
        p_key: 'students.read',
      });
      expect(scoped.error).toBeNull();
      expect(scoped.data).toEqual([fx.stages.primary]);

      const wide = await fx.users.principal.client.rpc('perm_scope', { p_key: 'students.read' });
      expect(wide.error).toBeNull();
      expect(wide.data).toBeNull();
    });

    it("is '{}' (no grant) for a key the caller lacks", async () => {
      const { data } = await fx.users.principal.client.rpc('perm_scope', { p_key: 'finance.read' });
      expect(data).toEqual([]);
    });

    it('ignores stages for keys that are not stage-scopable', async () => {
      const { data } = await fx.users.principalPrimary.client.rpc('perm_scope', {
        p_key: 'users.read',
      });
      expect(data).toBeNull();
    });
  });

  describe('role model triggers', () => {
    it('refuses PORTAL_STAFF_MIX (staff role on a guardian)', async () => {
      const { error } = await service
        .from('role_assignment')
        .insert({ user_id: fx.users.guardianX.userId, school_id: fx.schoolA, role: 'teacher' });
      expect(errText(error)).toContain('PORTAL_STAFF_MIX');
    });

    it('refuses PORTAL_STAFF_MIX (portal role on a teacher)', async () => {
      const { error } = await service
        .from('role_assignment')
        .insert({ user_id: fx.users.teacher.userId, school_id: fx.schoolA, role: 'guardian' });
      expect(errText(error)).toContain('PORTAL_STAFF_MIX');
    });

    it('refuses STAGE_SCOPE_NOT_ALLOWED (stages on a teacher)', async () => {
      const { data: a } = await service
        .from('role_assignment')
        .select('id')
        .eq('user_id', fx.users.teacher.userId)
        .single();
      const { error } = await service
        .from('role_assignment_stage')
        .insert({ assignment_id: a!.id, stage_id: fx.stages.primary, school_id: fx.schoolA });
      expect(errText(error)).toContain('STAGE_SCOPE_NOT_ALLOWED');
    });

    it('cannot store a never-grantable switch: (teacher, finance.read) is an FK violation (SC-009)', async () => {
      const { error } = await service.from('school_role_permission').insert({
        school_id: fx.schoolA,
        role: 'teacher',
        permission_key: 'finance.read',
        enabled: true,
      });
      expect(error).not.toBeNull();
      expect(error!.code).toBe('23503');
    });

    it('a multi-role user keeps the highest-precedence primary role', async () => {
      const { data } = await service
        .from('user')
        .select('role')
        .eq('id', fx.users.principalViewer.userId)
        .single();
      expect(data!.role).toBe('principal');
    });
  });

  describe('status-aware current_school_id()', () => {
    it('is null for a deactivated user, who then holds no key', async () => {
      const u = await createAuthedStaff(service, {
        roles: ['viewer'],
        schoolId: fx.schoolA,
        status: 'deactivated',
      });
      try {
        const school = await u.client.rpc('current_school_id');
        expect(school.error).toBeNull();
        expect(school.data).toBeNull();
        const perm = await u.client.rpc('has_perm', { p_key: 'finance.read' });
        expect(perm.data).toBe(false);
        const access = MyAccess.parse((await u.client.rpc('my_access')).data);
        expect(access.status).toBe('deactivated');
        expect(access.permissions).toEqual([]);
        const { data: rows } = await u.client.from('money_event').select('id');
        expect(rows ?? []).toHaveLength(0);
      } finally {
        await u.cleanup();
      }
    });
  });

  describe('super-admin cannot bypass the role model (U1)', () => {
    // user_superadmin_all lets the super-admin write public.user; the guard
    // trigger must refuse role / status / school changes. The super-admin has
    // only SELECT granted today, so a refusal may also surface as 42501;
    // either way the row must be unchanged.
    const cases = [
      ['role', { role: 'viewer' }],
      ['status', { status: 'deactivated' }],
      ['school_id', { school_id: '00000000-0000-0000-0000-000000000000' }],
    ] as const;

    it.each(cases)('refuses a direct %s change', async (_col, patch) => {
      const target = fx.users.accountant.userId;
      const { error } = await fx.users.superAdmin.client
        .from('user')
        .update(patch)
        .eq('id', target);
      expect(error).not.toBeNull();
      expect(
        errText(error).includes('DIRECT_ROLE_CHANGE_FORBIDDEN') || error!.code === '42501',
        `unexpected error ${error!.code} ${error!.message}`,
      ).toBe(true);
      const { data } = await service
        .from('user')
        .select('role, status, school_id')
        .eq('id', target)
        .single();
      expect(data).toEqual({ role: 'accountant', status: 'active', school_id: fx.schoolA });
    });
  });
});

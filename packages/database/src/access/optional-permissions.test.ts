import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  getServiceClient,
  INTEGRATION_ENV_READY,
  setSubscriptionState,
} from '../test-helpers/supabase.js';
import { buildAccessFixture, type AccessFixture } from './fixture.js';
import { isRefusal } from './run-matrix.js';

/**
 * Optional permissions per role (US5, FR-020–FR-023, SC-006/SC-009, T070).
 * Every call runs with the caller's own session; the service client only
 * arranges state and reads the audit trail. Must FAIL before 0046.
 */
const d = INTEGRATION_ENV_READY ? describe : describe.skip;

type Role = 'teacher' | 'student_affairs' | 'principal' | 'viewer' | 'guardian';

d('optional permissions (0046)', () => {
  const service = getServiceClient()!;
  let fx: AccessFixture;
  const admin = () => fx.users.adminA.client;
  const set = (role: Role, key: string, enabled: boolean, c = admin()) =>
    c.rpc('set_optional_permission', { p_role: role, p_key: key, p_enabled: enabled });

  async function auditRows() {
    const { data } = await service
      .from('access_audit_entry')
      .select('actor_id, target_user_id, before, after')
      .eq('school_id', fx.schoolA)
      .eq('action', 'optional_permission_changed');
    return data ?? [];
  }

  beforeAll(async () => {
    fx = await buildAccessFixture(service);
  }, 180_000);
  afterAll(async () => {
    await fx?.cleanup();
  }, 180_000);
  beforeEach(async () => {
    await setSubscriptionState(service, fx.schoolA, 'active');
    await service.from('school_role_permission').delete().eq('school_id', fx.schoolA);
  });

  it('optional_permission_matrix lists the 6 catalogue switches with their defaults', async () => {
    const { data, error } = await admin().rpc('optional_permission_matrix');
    expect(error).toBeNull();
    const rows = data as { role: string; permission_key: string; enabled: boolean }[];
    expect(rows).toHaveLength(6);
    const on = rows.filter((r) => r.enabled).map((r) => `${r.role}/${r.permission_key}`);
    expect(on).toEqual(['viewer/finance.export']);
    // The principal (users.read) can read it; student affairs cannot.
    expect((await fx.users.principal.client.rpc('optional_permission_matrix')).error).toBeNull();
    expect(isRefusal((await fx.users.sa.client.rpc('optional_permission_matrix')).error)).toBe(
      true,
    );
  });

  it('nothing outside the catalogue can be granted (constitution XIV, US5-2, SC-009)', async () => {
    const before = (await auditRows()).length;
    for (const [role, key] of [
      ['principal', 'finance.read'],
      ['teacher', 'finance.read'],
      ['student_affairs', 'finance.write'],
      ['principal', 'users.manage'],
      ['guardian', 'finance.read'],
    ] as const) {
      const { error } = await set(role, key, true);
      expect(error?.message, `${role}/${key}`).toContain('NOT_GRANTABLE');
    }
    expect(await auditRows()).toHaveLength(before);
  });

  it('fee indicator on, then off: the same open session follows on its next call (SC-006)', async () => {
    const sa = fx.users.sa.client;
    const statuses = async () => {
      const { data } = await sa.rpc('student_directory', { p_school_id: fx.schoolA });
      return (data as { student_id: string; fin_status: string | null }[])
        .filter((r) => r.student_id === fx.students.X)
        .map((r) => r.fin_status);
    };
    expect(await statuses()).toEqual([null]);
    expect((await set('student_affairs', 'students.fee_indicator', true)).error).toBeNull();
    expect((await statuses())[0]).not.toBeNull();
    expect((await set('student_affairs', 'students.fee_indicator', false)).error).toBeNull();
    expect(await statuses()).toEqual([null]);
  });

  it('each real change writes exactly one audit row; setting the current value writes none', async () => {
    const before = (await auditRows()).length;
    expect((await set('teacher', 'students.guardian_contact', true)).error).toBeNull();
    expect((await set('teacher', 'students.guardian_contact', true)).error).toBeNull();
    const rows = (await auditRows()).filter(
      (r) => (r.after as { key?: string }).key === 'students.guardian_contact',
    );
    expect((await auditRows()).length - before).toBe(1);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actor_id: fx.users.adminA.userId,
      target_user_id: null,
      before: { role: 'teacher', key: 'students.guardian_contact', enabled: false },
      after: { role: 'teacher', key: 'students.guardian_contact', enabled: true },
    });
  });

  it('viewer finance.export defaults on; switching it off applies on the next request (US5-3)', async () => {
    const v = fx.users.viewer.client;
    const has = async () => (await v.rpc('has_perm', { p_key: 'finance.export' })).data;
    expect(await has()).toBe(true);
    expect((await set('viewer', 'finance.export', false)).error).toBeNull();
    expect(await has()).toBe(false);
  });

  it('a switch in school A does not affect school B (US5-1)', async () => {
    expect((await set('viewer', 'finance.export', false)).error).toBeNull();
    const { data } = await fx.users.adminB.client.rpc('optional_permission_matrix');
    const row = (data as { role: string; permission_key: string; enabled: boolean }[]).find(
      (r) => r.role === 'viewer' && r.permission_key === 'finance.export',
    );
    expect(row?.enabled).toBe(true);
  });

  it('grace: switching on is WRITES_GATED, switching off still works (FR-023)', async () => {
    await setSubscriptionState(service, fx.schoolA, 'grace');
    expect((await set('teacher', 'students.guardian_contact', true)).error?.message).toContain(
      'WRITES_GATED',
    );
    expect((await set('viewer', 'finance.export', false)).error).toBeNull();
  });

  it('non-admins get FORBIDDEN_PERMISSION', async () => {
    for (const u of ['principal', 'sa', 'accountant', 'viewer', 'teacher'] as const) {
      const { error } = await set('teacher', 'students.guardian_contact', true, fx.users[u].client);
      expect(error?.message, u).toContain('FORBIDDEN_PERMISSION');
    }
  });

  describe.skipIf(!process.env.ACCESS_BRANCH_DB)(
    'teacher roster with guardian contact (branch DB only)',
    () => {
      it('guardian contact appears once students.guardian_contact is on', async () => {
        const stub = `create or replace function public.teacher_section_ids() returns uuid[] language sql stable security definer set search_path = public
        as $$ select case when auth.uid() = '${fx.users.teacher.userId}'::uuid then array['${fx.sections.primary}'::uuid] else '{}'::uuid[] end $$;`;
        expect((await service.rpc('exec_branch_sql', { p_sql: stub })).error).toBeNull();
        try {
          const roster = async () =>
            (await fx.users.teacher.client.rpc('teacher_roster')).data as {
              guardian_phone: string | null;
            }[];
          expect((await roster())[0]?.guardian_phone).toBeNull();
          expect((await set('teacher', 'students.guardian_contact', true)).error).toBeNull();
          expect((await roster())[0]?.guardian_phone).not.toBeNull();
        } finally {
          await service.rpc('exec_branch_sql', {
            p_sql: `create or replace function public.teacher_section_ids() returns uuid[] language sql stable security definer set search_path = public as $$ select '{}'::uuid[] $$;`,
          });
        }
      });
    },
  );
});

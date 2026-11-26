import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getServiceClient, INTEGRATION_ENV_READY } from '../test-helpers/supabase.js';
import { buildAccessFixture, type AccessFixture } from './fixture.js';

/**
 * Revocation applies on the next request (FR-028, SC-006, T048). The SAME
 * signed-in client keeps its (still valid) access token; the database must
 * stop honouring it as soon as the change commits.
 */
const d = INTEGRATION_ENV_READY ? describe : describe.skip;

d('revocation is immediate', () => {
  const service = getServiceClient()!;
  let fx: AccessFixture;

  beforeAll(async () => {
    fx = await buildAccessFixture(service);
  }, 180_000);
  afterAll(async () => {
    await fx?.cleanup();
  }, 180_000);

  const studentIds = async (c: AccessFixture['users']['sa']['client']) =>
    ((await c.from('student').select('id')).data ?? []).map((r) => r.id as string);

  it('deactivation: the open session reads 0 rows and its next RPC is refused', async () => {
    const c = fx.users.teacherSa.client;
    expect((await studentIds(c)).length).toBeGreaterThan(0);
    const { error } = await fx.users.adminA.client.rpc('deactivate_user', {
      p_user_id: fx.users.teacherSa.userId,
    });
    expect(error).toBeNull();
    expect(await studentIds(c)).toHaveLength(0);
    const rpc = await c.rpc('student_directory', { p_school_id: fx.schoolA });
    expect(rpc.error).not.toBeNull();
    expect(
      (
        await fx.users.adminA.client.rpc('reactivate_user', {
          p_user_id: fx.users.teacherSa.userId,
        })
      ).error,
    ).toBeNull();
  });

  it('removing the student_affairs role: the same session loses the students', async () => {
    const c = fx.users.teacherSa.client;
    expect((await studentIds(c)).length).toBeGreaterThan(0);
    const { error } = await fx.users.adminA.client.rpc('set_user_roles', {
      p_user_id: fx.users.teacherSa.userId,
      p_roles: ['teacher'],
    });
    expect(error).toBeNull();
    expect(await studentIds(c)).toHaveLength(0);
  });

  it('narrowing saMiddle to Primary: Y disappears and X appears on the next request', async () => {
    const c = fx.users.saMiddle.client;
    expect(await studentIds(c)).toEqual([fx.students.Y]);
    const { error } = await fx.users.adminA.client.rpc('set_user_roles', {
      p_user_id: fx.users.saMiddle.userId,
      p_roles: ['student_affairs'],
      p_stage_scope: { student_affairs: [fx.stages.primary] },
    });
    expect(error).toBeNull();
    const now = await studentIds(c);
    expect(now).not.toContain(fx.students.Y);
    expect(now).toContain(fx.students.X);
  });
});

import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  getServiceClient,
  INTEGRATION_ENV_READY,
  setSubscriptionState,
} from '../test-helpers/supabase.js';
import { buildAccessFixture, type AccessFixture } from './fixture.js';
import { isRefusal } from './run-matrix.js';

/**
 * Access audit (US6, FR-031–FR-033, SC-007, T074). One of each
 * access_audit_action is produced through the real functions, then read back
 * with list_access_audit() as the school admin. Must FAIL before 0047.
 */
const d = INTEGRATION_ENV_READY ? describe : describe.skip;

const sha256Hex = (s: string) => `\\x${createHash('sha256').update(s).digest('hex')}`;
const email = (tag: string) =>
  `aud-${tag}-${Date.now()}-${Math.round(Math.random() * 1e6)}@example.test`;
const khartoum = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Khartoum',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(iso));

interface AuditRow {
  id: number;
  occurred_at: string;
  actor_id: string | null;
  actor_name: string | null;
  target_user_id: string | null;
  target_name: string | null;
  target_email: string | null;
  action: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}

d('access audit (0047)', () => {
  const service = getServiceClient()!;
  let fx: AccessFixture;
  const admin = () => fx.users.adminA.client;
  const authUsers: string[] = [];
  let startedAt: string;
  let rows: AuditRow[] = [];

  async function invite(tag: string, roles: string[] = ['teacher']) {
    const e = email(tag);
    const { data: id, error } = await admin().rpc('create_invitation', {
      p_email: e,
      p_roles: roles,
    });
    expect(error).toBeNull();
    return { id: id as string, email: e };
  }

  beforeAll(async () => {
    fx = await buildAccessFixture(service);
    await setSubscriptionState(service, fx.schoolA, 'active');
    startedAt = new Date(Date.now() - 1000).toISOString();

    // invitation_sent + invitation_accepted
    const acc = await invite('acc');
    const { data: token } = await admin().rpc('issue_invitation_token', {
      p_invitation_id: acc.id,
    });
    const { data: au } = await service.auth.admin.createUser({
      email: acc.email,
      password: 'Test-Passw0rd!',
      email_confirm: true,
    });
    authUsers.push(au.user!.id);
    await service.from('invitation').update({ auth_user_id: au.user!.id }).eq('id', acc.id);
    const accepted = await service.rpc('accept_invitation', {
      p_token_hash: sha256Hex(token as string),
      p_display_name: 'معلم مقبول',
      p_auth_user_id: au.user!.id,
    });
    expect(accepted.error).toBeNull();

    // invitation_revoked
    const rev = await invite('rev');
    expect((await admin().rpc('revoke_invitation', { p_invitation_id: rev.id })).error).toBeNull();

    // invitation_expired
    const exp = await invite('exp');
    await service
      .from('invitation')
      .update({ expires_at: new Date(Date.now() - 60_000).toISOString() })
      .eq('id', exp.id);
    expect((await service.rpc('expire_invitations')).error).toBeNull();

    // role_added, role_removed, stage_scope_changed (on the viewer and saMiddle)
    const viewer = fx.users.viewer.userId;
    expect(
      (await admin().rpc('set_user_roles', { p_user_id: viewer, p_roles: ['viewer', 'principal'] }))
        .error,
    ).toBeNull();
    expect(
      (await admin().rpc('set_user_roles', { p_user_id: viewer, p_roles: ['viewer'] })).error,
    ).toBeNull();
    expect(
      (
        await admin().rpc('set_user_roles', {
          p_user_id: fx.users.saMiddle.userId,
          p_roles: ['student_affairs'],
          p_stage_scope: { student_affairs: [fx.stages.middle, fx.stages.primary] },
        })
      ).error,
    ).toBeNull();

    // user_deactivated, user_reactivated (on the teacher)
    expect(
      (await admin().rpc('deactivate_user', { p_user_id: fx.users.teacher.userId })).error,
    ).toBeNull();
    expect(
      (await admin().rpc('reactivate_user', { p_user_id: fx.users.teacher.userId })).error,
    ).toBeNull();

    // optional_permission_changed
    expect(
      (
        await admin().rpc('set_optional_permission', {
          p_role: 'teacher',
          p_key: 'students.guardian_contact',
          p_enabled: true,
        })
      ).error,
    ).toBeNull();

    const { data, error } = await admin().rpc('list_access_audit', { p_from: startedAt });
    expect(error).toBeNull();
    rows = data as AuditRow[];
  }, 240_000);

  afterAll(async () => {
    await service.from('invitation').delete().eq('school_id', fx?.schoolA);
    for (const id of authUsers) {
      await service.from('user').delete().eq('id', id);
      await service.auth.admin.deleteUser(id);
    }
    await fx?.cleanup();
  }, 180_000);

  const one = (action: string) => {
    const r = rows.filter((x) => x.action === action);
    expect(r, action).toHaveLength(1);
    return r[0]!;
  };

  it('exactly one row per action, newest first, with actor, target and before/after (US6-1)', () => {
    for (const a of [
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
    ]) {
      if (a === 'invitation_sent') {
        // Three invitations were sent (accepted, revoked, expired), one row each.
        expect(rows.filter((x) => x.action === a)).toHaveLength(3);
        continue;
      }
      one(a);
    }
    expect(rows.map((r) => r.id)).toEqual([...rows.map((r) => r.id)].sort((x, y) => y - x));

    const added = one('role_added');
    expect(added).toMatchObject({
      actor_id: fx.users.adminA.userId,
      target_user_id: fx.users.viewer.userId,
    });
    expect(added.actor_name).toBeTruthy();
    expect(added.target_name).toBeTruthy();
    expect(JSON.stringify(added.after)).toContain('principal');

    expect(one('user_deactivated').target_user_id).toBe(fx.users.teacher.userId);
    expect(one('optional_permission_changed')).toMatchObject({
      target_user_id: null,
      before: { role: 'teacher', key: 'students.guardian_contact', enabled: false },
      after: { role: 'teacher', key: 'students.guardian_contact', enabled: true },
    });
    expect(one('invitation_revoked').target_email).toMatch(/^aud-rev-/);
  });

  it('occurred_at is a real instant that formats to Africa/Khartoum wall time (UTC+2)', () => {
    const r = one('user_deactivated');
    const utc = new Date(r.occurred_at);
    expect(Math.abs(Date.now() - utc.getTime())).toBeLessThan(10 * 60_000);
    const plus2 = new Date(utc.getTime() + 2 * 3600_000);
    const expected = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'UTC',
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(plus2);
    expect(khartoum(r.occurred_at)).toBe(expected);
  });

  it('filters by user (actor or target), action and date range; keyset paging', async () => {
    const byTeacher = (
      await admin().rpc('list_access_audit', {
        p_user_id: fx.users.teacher.userId,
        p_from: startedAt,
      })
    ).data as AuditRow[];
    expect(byTeacher.map((r) => r.action).sort()).toEqual(['user_deactivated', 'user_reactivated']);

    const byAction = (
      await admin().rpc('list_access_audit', { p_action: 'role_removed', p_from: startedAt })
    ).data as AuditRow[];
    expect(byAction).toHaveLength(1);

    const future = (
      await admin().rpc('list_access_audit', {
        p_from: new Date(Date.now() + 3600_000).toISOString(),
      })
    ).data as AuditRow[];
    expect(future).toHaveLength(0);

    const page1 = (await admin().rpc('list_access_audit', { p_from: startedAt, p_limit: 4 }))
      .data as AuditRow[];
    const page2 = (
      await admin().rpc('list_access_audit', {
        p_from: startedAt,
        p_limit: 4,
        p_before_id: page1[page1.length - 1]!.id,
      })
    ).data as AuditRow[];
    expect(page1).toHaveLength(4);
    expect([...page1, ...page2].map((r) => r.id)).toEqual(rows.slice(0, 8).map((r) => r.id));
  });

  it('the log is immutable (US6-2)', async () => {
    const id = rows[0]!.id;
    const svc = await service.from('access_audit_entry').update({ after: {} }).eq('id', id);
    expect(svc.error?.message).toContain('AUDIT_IMMUTABLE');
    const del = await service.from('access_audit_entry').delete().eq('id', id);
    expect(del.error?.message).toContain('AUDIT_IMMUTABLE');
    for (const op of [
      admin().from('access_audit_entry').update({ after: {} }).eq('id', id).select(),
      admin().from('access_audit_entry').delete().eq('id', id).select(),
    ]) {
      const { data, error } = await op;
      expect(error !== null || (data ?? []).length === 0).toBe(true);
    }
  });

  it('only users.read holders can read it (US6-3); the super-admin sees nothing', async () => {
    expect(
      ((await fx.users.principal.client.rpc('list_access_audit', { p_from: startedAt })).data ?? [])
        .length,
    ).toBeGreaterThan(0);
    for (const u of ['teacher', 'accountant', 'viewer', 'sa', 'superAdmin'] as const) {
      const c = fx.users[u].client;
      expect(isRefusal((await c.rpc('list_access_audit')).error), u).toBe(true);
      expect((await c.from('access_audit_entry').select('id')).data ?? [], u).toHaveLength(0);
    }
  });
});

import { createHash } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  getServiceClient,
  INTEGRATION_ENV_READY,
  setSubscriptionState,
} from '../test-helpers/supabase.js';
import { buildAccessFixture, type AccessFixture } from './fixture.js';

/**
 * User management rules (contracts/rpc-contracts.md §B, US3, SC-005/007, T047).
 * Every function runs with the caller's own session; the service client only
 * arranges state and reads the audit trail. Must FAIL before 0043/0044.
 */
const d = INTEGRATION_ENV_READY ? describe : describe.skip;

const msg = (e: { message?: string } | null) => e?.message ?? '';
const sha256 = (s: string) => createHash('sha256').update(s).digest();
const hex = (b: Buffer) => `\\x${b.toString('hex')}`;
const email = (tag: string) =>
  `inv-${tag}-${Date.now()}-${Math.round(Math.random() * 1e6)}@example.test`;

d('user management (0043/0044)', () => {
  const service = getServiceClient()!;
  let fx: AccessFixture;
  const admin = () => fx.users.adminA.client;

  async function auditCount(action: string, extra: Record<string, unknown> = {}) {
    let q = service
      .from('access_audit_entry')
      .select('id', { count: 'exact', head: true })
      .eq('school_id', fx.schoolA)
      .eq('action', action);
    for (const [k, v] of Object.entries(extra)) q = q.eq(k, v as string);
    const { count } = await q;
    return count ?? 0;
  }

  beforeAll(async () => {
    fx = await buildAccessFixture(service);
  }, 180_000);
  afterAll(async () => {
    await service.from('invitation').delete().eq('school_id', fx?.schoolA);
    await fx?.cleanup();
  }, 180_000);
  beforeEach(async () => {
    await setSubscriptionState(service, fx.schoolA, 'active');
  });

  describe('invitations', () => {
    it('create_invitation: pending, 7-day expiry, one invitation_sent audit row', async () => {
      const before = await auditCount('invitation_sent');
      const e = email('create');
      const { data: id, error } = await admin().rpc('create_invitation', {
        p_email: e,
        p_roles: ['teacher'],
      });
      expect(error).toBeNull();
      const { data: inv } = await service
        .from('invitation')
        .select('state, created_at, expires_at, roles')
        .eq('id', id)
        .single();
      expect(inv!.state).toBe('pending');
      expect(new Date(inv!.expires_at).getTime() - new Date(inv!.created_at).getTime()).toBe(
        7 * 24 * 3600 * 1000,
      );
      expect(await auditCount('invitation_sent')).toBe(before + 1);
    });

    it('refuses a duplicate pending invitation and an email already in use', async () => {
      const e = email('dup');
      await admin().rpc('create_invitation', { p_email: e, p_roles: ['teacher'] });
      const dup = await admin().rpc('create_invitation', { p_email: e, p_roles: ['viewer'] });
      expect(dup.error).not.toBeNull();
      const used = await admin().rpc('create_invitation', {
        p_email: fx.users.teacher.email,
        p_roles: ['teacher'],
      });
      expect(msg(used.error)).toContain('EMAIL_IN_USE');
    });

    it('refuses portal roles and stages on roles other than principal/student_affairs', async () => {
      const portal = await admin().rpc('create_invitation', {
        p_email: email('portal'),
        p_roles: ['guardian'],
      });
      expect(portal.error).not.toBeNull();
      const stages = await admin().rpc('create_invitation', {
        p_email: email('stage'),
        p_roles: ['teacher'],
        p_stage_scope: { teacher: [fx.stages.primary] },
      });
      expect(msg(stages.error)).toContain('STAGE_SCOPE_NOT_ALLOWED');
    });

    it('issue_invitation_token returns a 43-char token whose hash is stored, never the token', async () => {
      const { data: id } = await admin().rpc('create_invitation', {
        p_email: email('tok'),
        p_roles: ['teacher'],
      });
      const { data: token, error } = await admin().rpc('issue_invitation_token', {
        p_invitation_id: id,
      });
      expect(error).toBeNull();
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      const { data: inv } = await service
        .from('invitation')
        .select('token_hash')
        .eq('id', id)
        .single();
      expect(inv!.token_hash).toBe(hex(sha256(token as string)));
      expect(String(inv!.token_hash)).not.toContain(token as string);
      // authenticated can never read token_hash (column privilege revoked)
      const { error: colErr } = await admin().from('invitation').select('token_hash').eq('id', id);
      expect(colErr).not.toBeNull();
    });

    async function pendingWithToken(roles: string[], stage_scope: Record<string, string[]> = {}) {
      const e = email('acc');
      const { data: id } = await admin().rpc('create_invitation', {
        p_email: e,
        p_roles: roles,
        p_stage_scope: stage_scope,
      });
      const { data: token } = await admin().rpc('issue_invitation_token', { p_invitation_id: id });
      const { data: au } = await service.auth.admin.createUser({
        email: e,
        password: 'Test-Passw0rd!',
        email_confirm: true,
      });
      await service.from('invitation').update({ auth_user_id: au.user!.id }).eq('id', id);
      return { id: id as string, token: token as string, authUserId: au.user!.id, email: e };
    }

    it('accept_invitation (service role) creates the user with its roles and stages; single use', async () => {
      const inv = await pendingWithToken(['principal'], { principal: [fx.stages.primary] });
      const { data, error } = await service.rpc('accept_invitation', {
        p_token_hash: hex(sha256(inv.token)),
        p_display_name: 'مدير مقبول',
        p_auth_user_id: inv.authUserId,
      });
      expect(error).toBeNull();
      expect(data).toMatchObject({ school_id: fx.schoolA, roles: ['principal'] });
      const { data: ra } = await service
        .from('role_assignment')
        .select('id, role')
        .eq('user_id', inv.authUserId);
      expect(ra!.map((r) => r.role)).toEqual(['principal']);
      const { data: st } = await service
        .from('role_assignment_stage')
        .select('stage_id')
        .eq('assignment_id', ra![0]!.id);
      expect(st!.map((s) => s.stage_id)).toEqual([fx.stages.primary]);
      expect(await auditCount('invitation_accepted', { target_user_id: inv.authUserId })).toBe(1);

      const again = await service.rpc('accept_invitation', {
        p_token_hash: hex(sha256(inv.token)),
        p_display_name: 'x',
        p_auth_user_id: inv.authUserId,
      });
      expect(msg(again.error)).toContain('INVITATION_INVALID');
      await service.from('user').delete().eq('id', inv.authUserId);
      await service.auth.admin.deleteUser(inv.authUserId);
    });

    it('a revoked or expired token is INVITATION_INVALID; authenticated cannot accept', async () => {
      const revoked = await pendingWithToken(['teacher']);
      const { error: rErr } = await admin().rpc('revoke_invitation', {
        p_invitation_id: revoked.id,
      });
      expect(rErr).toBeNull();
      expect(await auditCount('invitation_revoked')).toBeGreaterThanOrEqual(1);
      const r = await service.rpc('accept_invitation', {
        p_token_hash: hex(sha256(revoked.token)),
        p_display_name: 'x',
        p_auth_user_id: revoked.authUserId,
      });
      expect(msg(r.error)).toContain('INVITATION_INVALID');

      const expired = await pendingWithToken(['teacher']);
      await service
        .from('invitation')
        .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
        .eq('id', expired.id);
      const x = await service.rpc('accept_invitation', {
        p_token_hash: hex(sha256(expired.token)),
        p_display_name: 'x',
        p_auth_user_id: expired.authUserId,
      });
      expect(msg(x.error)).toContain('INVITATION_INVALID');

      const asUser = await admin().rpc('accept_invitation', {
        p_token_hash: hex(sha256(expired.token)),
        p_display_name: 'x',
        p_auth_user_id: expired.authUserId,
      });
      expect(asUser.error?.code).toBe('42501');
      for (const u of [revoked, expired]) await service.auth.admin.deleteUser(u.authUserId);
    });

    it('expire_invitations (service role) expires overdue invitations with an audit row each', async () => {
      const { data: id } = await admin().rpc('create_invitation', {
        p_email: email('exp'),
        p_roles: ['viewer'],
      });
      await service
        .from('invitation')
        .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
        .eq('id', id);
      const { data: n, error } = await service.rpc('expire_invitations');
      expect(error).toBeNull();
      expect(n as number).toBeGreaterThanOrEqual(1);
      const { data: inv } = await service.from('invitation').select('state').eq('id', id).single();
      expect(inv!.state).toBe('expired');
      const asUser = await admin().rpc('expire_invitations');
      expect(asUser.error?.code).toBe('42501');
    });
  });

  describe('roles, status and safety rules', () => {
    it('set_user_roles adds and removes roles with one audit row per role', async () => {
      const target = fx.users.viewer.userId;
      const addBefore = await auditCount('role_added', { target_user_id: target });
      const { error } = await admin().rpc('set_user_roles', {
        p_user_id: target,
        p_roles: ['viewer', 'teacher'],
      });
      expect(error).toBeNull();
      expect(await auditCount('role_added', { target_user_id: target })).toBe(addBefore + 1);
      const remBefore = await auditCount('role_removed', { target_user_id: target });
      await admin().rpc('set_user_roles', { p_user_id: target, p_roles: ['viewer'] });
      expect(await auditCount('role_removed', { target_user_id: target })).toBe(remBefore + 1);
    });

    it('stage changes write one stage_scope_changed row per role', async () => {
      const target = fx.users.saMiddle.userId;
      const before = await auditCount('stage_scope_changed', { target_user_id: target });
      const { error } = await admin().rpc('set_user_roles', {
        p_user_id: target,
        p_roles: ['student_affairs'],
        p_stage_scope: { student_affairs: [fx.stages.middle, fx.stages.primary] },
      });
      expect(error).toBeNull();
      expect(await auditCount('stage_scope_changed', { target_user_id: target })).toBe(before + 1);
      await admin().rpc('set_user_roles', {
        p_user_id: target,
        p_roles: ['student_affairs'],
        p_stage_scope: { student_affairs: [fx.stages.middle] },
      });
    });

    it('refuses self change, empty roles, portal mix, stages on teacher and other-school targets', async () => {
      expect(
        msg(
          (
            await admin().rpc('set_user_roles', {
              p_user_id: fx.users.adminA.userId,
              p_roles: ['viewer'],
            })
          ).error,
        ),
      ).toContain('SELF_CHANGE_FORBIDDEN');
      expect(
        msg(
          (await admin().rpc('set_user_roles', { p_user_id: fx.users.viewer.userId, p_roles: [] }))
            .error,
        ),
      ).toContain('ROLES_REQUIRED');
      expect(
        msg(
          (
            await admin().rpc('set_user_roles', {
              p_user_id: fx.users.viewer.userId,
              p_roles: ['viewer', 'guardian'],
            })
          ).error,
        ),
      ).toMatch(/PORTAL_STAFF_MIX|invalid/);
      expect(
        msg(
          (
            await admin().rpc('set_user_roles', {
              p_user_id: fx.users.teacher.userId,
              p_roles: ['teacher'],
              p_stage_scope: { teacher: [fx.stages.primary] },
            })
          ).error,
        ),
      ).toContain('STAGE_SCOPE_NOT_ALLOWED');
      expect(
        msg(
          (
            await admin().rpc('set_user_roles', {
              p_user_id: fx.users.adminB.userId,
              p_roles: ['viewer'],
            })
          ).error,
        ),
      ).toContain('NOT_FOUND');
      expect(
        msg(
          (
            await admin().rpc('set_user_roles', {
              p_user_id: fx.users.guardianX.userId,
              p_roles: ['teacher'],
            })
          ).error,
        ),
      ).toContain('NOT_FOUND');
    });

    it('LAST_ADMIN_PROTECTED: concurrent removal of school_admin from both admins → exactly one succeeds', async () => {
      const [a, b] = await Promise.all([
        fx.users.adminA2.client.rpc('set_user_roles', {
          p_user_id: fx.users.adminA.userId,
          p_roles: ['viewer'],
        }),
        fx.users.adminA.client.rpc('set_user_roles', {
          p_user_id: fx.users.adminA2.userId,
          p_roles: ['viewer'],
        }),
      ]);
      const ok = [a, b].filter((r) => !r.error).length;
      expect(ok).toBe(1);
      const failed = [a, b].find((r) => r.error)!;
      expect(msg(failed.error)).toMatch(/LAST_ADMIN_PROTECTED|FORBIDDEN_PERMISSION/);
      // restore: the surviving admin re-grants school_admin to the other one
      const survivor = a.error ? fx.users.adminA : fx.users.adminA2;
      const demoted = a.error ? fx.users.adminA2 : fx.users.adminA;
      const { error } = await survivor.client.rpc('set_user_roles', {
        p_user_id: demoted.userId,
        p_roles: ['school_admin'],
      });
      expect(error).toBeNull();
    });

    it('deactivate/reactivate are audited; the last admin cannot be deactivated', async () => {
      const t = fx.users.teacher.userId;
      expect((await admin().rpc('deactivate_user', { p_user_id: t })).error).toBeNull();
      const { data: u } = await service.from('user').select('status').eq('id', t).single();
      expect(u!.status).toBe('deactivated');
      expect(await auditCount('user_deactivated', { target_user_id: t })).toBe(1);
      expect((await admin().rpc('reactivate_user', { p_user_id: t })).error).toBeNull();
      expect(await auditCount('user_reactivated', { target_user_id: t })).toBe(1);

      await admin().rpc('deactivate_user', { p_user_id: fx.users.adminA2.userId });
      const last = await fx.users.adminA2.client.rpc('deactivate_user', {
        p_user_id: fx.users.adminA.userId,
      });
      expect(last.error).not.toBeNull();
      await service.from('user').update({ status: 'active' }).eq('id', fx.users.adminA2.userId);
    });

    it.each(['accountant', 'viewer', 'teacher', 'sa', 'principal'] as const)(
      '%s gets FORBIDDEN_PERMISSION on every management function (US3-6)',
      async (user) => {
        const c = fx.users[user].client;
        const calls: [string, Record<string, unknown>][] = [
          ['create_invitation', { p_email: email('forb'), p_roles: ['teacher'] }],
          ['set_user_roles', { p_user_id: fx.users.viewer.userId, p_roles: ['viewer'] }],
          ['deactivate_user', { p_user_id: fx.users.viewer.userId }],
          ['reactivate_user', { p_user_id: fx.users.viewer.userId }],
        ];
        for (const [fn, args] of calls)
          expect(msg((await c.rpc(fn, args)).error), fn).toContain('FORBIDDEN_PERMISSION');
      },
    );
  });

  describe('write gating (FR-023): grants gated, revocations allowed', () => {
    it('in grace: invite, reactivate and widening are WRITES_GATED; deactivate, removal and narrowing succeed', async () => {
      await setSubscriptionState(service, fx.schoolA, 'grace');
      expect(
        msg(
          (
            await admin().rpc('create_invitation', {
              p_email: email('grace'),
              p_roles: ['teacher'],
            })
          ).error,
        ),
      ).toContain('WRITES_GATED');
      expect(
        msg(
          (
            await admin().rpc('set_user_roles', {
              p_user_id: fx.users.viewer.userId,
              p_roles: ['viewer', 'teacher'],
            })
          ).error,
        ),
      ).toContain('WRITES_GATED');
      expect(
        (await admin().rpc('deactivate_user', { p_user_id: fx.users.viewer.userId })).error,
      ).toBeNull();
      expect(
        msg((await admin().rpc('reactivate_user', { p_user_id: fx.users.viewer.userId })).error),
      ).toContain('WRITES_GATED');
      expect(
        (
          await admin().rpc('set_user_roles', {
            p_user_id: fx.users.teacherSa.userId,
            p_roles: ['teacher'],
          })
        ).error,
      ).toBeNull();
      // mixed change (add one, remove one) is refused as a whole
      expect(
        msg(
          (
            await admin().rpc('set_user_roles', {
              p_user_id: fx.users.principalViewer.userId,
              p_roles: ['principal', 'teacher'],
            })
          ).error,
        ),
      ).toContain('WRITES_GATED');
      await setSubscriptionState(service, fx.schoolA, 'active');
      await service.from('user').update({ status: 'active' }).eq('id', fx.users.viewer.userId);
    });
  });

  describe('super-admin (FR-024)', () => {
    it('superadmin_set_school_admin restores an admin and is audited, but the super-admin reads no audit', async () => {
      const t = fx.users.principal.userId;
      await service.from('user').update({ status: 'deactivated' }).eq('id', t);
      const { error } = await fx.users.superAdmin.client.rpc('superadmin_set_school_admin', {
        p_user_id: t,
      });
      expect(error).toBeNull();
      const { data: u } = await service.from('user').select('status, role').eq('id', t).single();
      expect(u).toEqual({ status: 'active', role: 'school_admin' });
      expect(await auditCount('role_added', { target_user_id: t })).toBeGreaterThanOrEqual(1);
      const { data: seen } = await fx.users.superAdmin.client
        .from('access_audit_entry')
        .select('id');
      expect(seen ?? []).toHaveLength(0);
      const refused = await admin().rpc('superadmin_set_school_admin', {
        p_user_id: fx.users.viewer.userId,
      });
      expect(msg(refused.error)).toContain('FORBIDDEN_PERMISSION');
    });
  });

  describe('listing', () => {
    it('list_school_users and list_invitations need users.read and never expose token_hash', async () => {
      const { data: users, error } = await admin().rpc('list_school_users');
      expect(error).toBeNull();
      expect((users as unknown[]).length).toBeGreaterThan(10);
      const { data: invs } = await admin().rpc('list_invitations');
      for (const i of (invs ?? []) as Record<string, unknown>[])
        expect(i).not.toHaveProperty('token_hash');
      expect(msg((await fx.users.teacher.client.rpc('list_school_users')).error)).toContain(
        'FORBIDDEN_PERMISSION',
      );
      expect((await fx.users.principal.client.rpc('list_school_users')).error).toBeNull();
    });
  });
});

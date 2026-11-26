import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getServiceClient, INTEGRATION_ENV_READY, linkPortal } from '../test-helpers/supabase.js';
import { buildAccessFixture, type AccessFixture } from './fixture.js';
import { isRefusal } from './run-matrix.js';

/**
 * Reserved portal roles (US7, FR-014/FR-017/FR-018, T079). The guardian of X
 * and the student Y have relationship-scoped access to existing data, proven
 * here although no portal UI exists yet (feature 08). Every read runs as the
 * portal user's own session; the service client only arranges links.
 */
const d = INTEGRATION_ENV_READY ? describe : describe.skip;

d('portal roles (guardian, student)', () => {
  const service = getServiceClient()!;
  let fx: AccessFixture;
  const ids = async (c: AccessFixture['users']['guardianX']['client'], table: string, col = 'id') =>
    (((await c.from(table).select(col)).data ?? []) as unknown as Record<string, string>[])
      .map((r) => r[col])
      .sort();

  beforeAll(async () => {
    fx = await buildAccessFixture(service);
  }, 180_000);
  afterAll(async () => {
    await fx?.cleanup();
  }, 180_000);

  /** Finance tables and functions a portal user must never reach. */
  async function expectNoFinance(c: AccessFixture['users']['guardianX']['client'], who: string) {
    for (const table of [
      'money_event',
      'account',
      'receipt_counter',
      'installment',
      'sms_message_log',
      'payment_allocation',
      'discount',
    ])
      expect(((await c.from(table).select('id')).data ?? []).length, `${who} ${table}`).toBe(0);
    for (const [fn, args] of [
      ['dashboard_kpis', { p_school_id: fx.schoolA }],
      ['receivables_aging', { p_school_id: fx.schoolA }],
      ['account_balance', { p_account_id: fx.accounts.A }],
    ] as const)
      expect(isRefusal((await c.rpc(fn, args)).error), `${who} ${fn}`).toBe(true);
  }

  describe('guardian of X', () => {
    const g = () => fx.users.guardianX.client;

    it('sees only X in student and enrollment (US7-1)', async () => {
      expect(await ids(g(), 'student')).toEqual([fx.students.X]);
      expect(await ids(g(), 'enrollment', 'student_id')).toEqual([fx.students.X]);
    });

    it('reads X’s fee summary and schedule; Y is FORBIDDEN_STUDENT (US7-2)', async () => {
      for (const fn of ['student_financial_summary', 'student_installments'] as const) {
        expect((await g().rpc(fn, { p_student_id: fx.students.X })).error, fn).toBeNull();
        expect((await g().rpc(fn, { p_student_id: fx.students.Y })).error?.message, fn).toContain(
          'FORBIDDEN_STUDENT',
        );
      }
    });

    it('reaches no finance table, statement or payment list (FR-014)', async () => {
      await expectNoFinance(g(), 'guardianX');
      for (const fn of ['student_statement', 'student_payments'] as const)
        expect(isRefusal((await g().rpc(fn, { p_student_id: fx.students.X })).error), fn).toBe(
          true,
        );
    });

    it('a sibling link adds Z, never Y; unlinking X removes it on the next request (FR-018)', async () => {
      const linkZ = await linkPortal(service, {
        userId: fx.users.guardianX.userId,
        studentId: fx.students.Z,
        schoolId: fx.schoolA,
        kind: 'guardian',
      });
      try {
        expect(await ids(g(), 'student')).toEqual([fx.students.X, fx.students.Z].sort());
        await service.from('portal_link').delete().eq('id', fx.portalLinks.guardianX);
        expect(await ids(g(), 'student')).toEqual([fx.students.Z]);
        expect(
          (await g().rpc('student_financial_summary', { p_student_id: fx.students.X })).error
            ?.message,
        ).toContain('FORBIDDEN_STUDENT');
      } finally {
        await service.from('portal_link').delete().eq('id', linkZ);
        await linkPortal(service, {
          userId: fx.users.guardianX.userId,
          studentId: fx.students.X,
          schoolId: fx.schoolA,
          kind: 'guardian',
        });
      }
    });
  });

  describe('student Y', () => {
    const s = () => fx.users.studentY.client;

    it('sees only Y; every finance table and function is closed (US7-3)', async () => {
      expect(await ids(s(), 'student')).toEqual([fx.students.Y]);
      await expectNoFinance(s(), 'studentY');
      expect(
        isRefusal(
          (await s().rpc('student_financial_summary', { p_student_id: fx.students.Y })).error,
        ),
      ).toBe(true);
    });
  });

  it('nobody can create a portal link through the API (FR-017)', async () => {
    for (const u of ['guardianX', 'adminA'] as const) {
      const { error } = await fx.users[u].client.from('portal_link').insert({
        user_id: fx.users.guardianX.userId,
        student_id: fx.students.Y,
        school_id: fx.schoolA,
        kind: 'guardian',
      });
      expect(isRefusal(error), u).toBe(true);
    }
  });

  it('portal users cannot be edited as staff: set_user_roles gives NOT_FOUND', async () => {
    const { error } = await fx.users.adminA.client.rpc('set_user_roles', {
      p_user_id: fx.users.guardianX.userId,
      p_roles: ['teacher'],
    });
    expect(error?.message).toContain('NOT_FOUND');
  });
});

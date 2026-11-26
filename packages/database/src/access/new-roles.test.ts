import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getServiceClient, INTEGRATION_ENV_READY } from '../test-helpers/supabase.js';
import { buildAccessFixture, type AccessFixture } from './fixture.js';
import { isRefusal } from './run-matrix.js';

/**
 * New staff roles within their defaults (US4, FR-007/008/008a/012/016/018a,
 * T065). Must FAIL before 0045 (register_student, teacher_roster and the
 * student-photos bucket do not exist yet).
 */
const d = INTEGRATION_ENV_READY ? describe : describe.skip;

d('new roles (0045)', () => {
  const service = getServiceClient()!;
  let fx: AccessFixture;

  beforeAll(async () => {
    fx = await buildAccessFixture(service);
    // One photo per enrolled student: <school>/<student>/photo.png (private bucket).
    const png = Uint8Array.from(
      atob(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
      ),
      (c) => c.charCodeAt(0),
    );
    for (const s of ['X', 'Y'] as const) {
      await service.storage
        .from('student-photos')
        .upload(`${fx.schoolA}/${fx.students[s]}/photo.png`, png, {
          contentType: 'image/png',
          upsert: true,
        });
    }
  }, 180_000);

  afterAll(async () => {
    await service.storage
      .from('student-photos')
      .remove([
        `${fx.schoolA}/${fx.students.X}/photo.png`,
        `${fx.schoolA}/${fx.students.Y}/photo.png`,
      ]);
    await fx?.cleanup();
  }, 180_000);

  const register = (
    c: AccessFixture['users']['sa']['client'],
    name: string,
    grade: 'primary' | 'middle',
  ) =>
    c.rpc('register_student', {
      p_student: { name, guardian_name: 'ولي', guardian_phone: '+249911111111' },
      p_enrollment: {
        grade_id: fx.grades[grade],
        section_id: fx.sections[grade],
        academic_year_id: fx.yearA,
      },
    });

  it('US4-1: student affairs registers + enrolls; installments are generated but hidden', async () => {
    const { data: id, error } = await register(fx.users.sa.client, 'طالب جديد', 'primary');
    expect(error).toBeNull();
    const { data: inst } = await service
      .from('installment')
      .select('id')
      .eq('student_id', id as string);
    expect((inst ?? []).length).toBe(2); // the fee structure's schedule
    const { data: mine } = await fx.users.sa.client
      .from('installment')
      .select('id')
      .eq('student_id', id as string);
    expect(mine ?? []).toHaveLength(0);
    const { data: dir } = await fx.users.sa.client.rpc('student_directory', {
      p_school_id: fx.schoolA,
    });
    const row = (dir as Record<string, unknown>[]).find((r) => r.student_id === id)!;
    expect(row).toBeTruthy();
    expect(row.total_owed).toBeNull();
    expect(row.total_charged).toBeNull();
  });

  it('US4-2: student affairs is refused every money RPC and finance setup', async () => {
    const c = fx.users.sa.client;
    const now = new Date().toISOString();
    for (const [fn, args] of [
      [
        'apply_fee_payment',
        {
          p_student_id: fx.students.X,
          p_account_id: fx.accounts.A,
          p_amount: 1,
          p_occurred_at: now,
          p_idempotency_key: crypto.randomUUID(),
        },
      ],
      [
        'apply_discount',
        {
          p_student_id: fx.students.X,
          p_kind: 'fixed',
          p_value: 1,
          p_idempotency_key: crypto.randomUUID(),
        },
      ],
      [
        'record_refund',
        {
          p_student_id: fx.students.X,
          p_account_id: fx.accounts.A,
          p_amount: 1,
          p_occurred_at: now,
          p_idempotency_key: crypto.randomUUID(),
        },
      ],
    ] as const) {
      expect(isRefusal((await c.rpc(fn, args)).error), fn).toBe(true);
    }
    const { error } = await c
      .from('fee_structure')
      .insert({ school_id: fx.schoolA, grade_id: fx.grades.primary, academic_year_id: fx.yearA });
    expect(isRefusal(error)).toBe(true);
  });

  it('US4-3: the teacher cannot change students, sections, enrollments or years', async () => {
    const c = fx.users.teacher.client;
    const ins = await c.from('student').insert({ school_id: fx.schoolA, name: 'x' });
    expect(isRefusal(ins.error)).toBe(true);
    for (const [table, id] of [
      ['student', fx.students.X],
      ['section', fx.sections.primary],
      ['enrollment', fx.enrollments.X],
      ['academic_year', fx.yearA],
    ] as const) {
      const { data } = await c
        .from(table)
        .update({ created_at: new Date().toISOString() })
        .eq('id', id)
        .select();
      expect(data ?? [], table).toHaveLength(0);
    }
    expect(isRefusal((await register(c, 'x', 'primary')).error)).toBe(true);
  });

  it('US4-4: principal sees every student, totals only, no finance detail', async () => {
    const c = fx.users.principal.client;
    const { data: s } = await c.from('student').select('id');
    expect((s ?? []).map((r) => r.id)).toEqual(
      expect.arrayContaining([fx.students.X, fx.students.Y, fx.students.Z]),
    );
    const { data: k } = await c.rpc('dashboard_kpis', { p_school_id: fx.schoolA });
    expect(Object.keys(k as object).sort()).toEqual([
      'collected_month',
      'collected_year',
      'collection_rate',
      'outstanding',
      'overdue_count',
    ]);
    for (const [fn, args] of [
      ['student_statement', { p_student_id: fx.students.X }],
      ['receivables_aging', { p_school_id: fx.schoolA }],
      ['account_balance', { p_account_id: fx.accounts.A }],
    ] as const)
      expect(isRefusal((await c.rpc(fn, args)).error), fn).toBe(true);
    expect((await c.from('money_event').select('id')).data ?? []).toHaveLength(0);
    // The money sorts would reveal who owes most through row order alone.
    for (const p_sort of ['owed_desc', 'oldest_overdue'])
      expect(
        isRefusal((await c.rpc('student_directory', { p_school_id: fx.schoolA, p_sort })).error),
        p_sort,
      ).toBe(true);
  });

  it('US4-5: principal + viewer reads finance as a viewer; removing viewer returns to totals', async () => {
    const c = fx.users.principalViewer.client;
    expect(((await c.from('money_event').select('id')).data ?? []).length).toBeGreaterThan(0);
    const refused = await c.rpc('apply_fee_payment', {
      p_student_id: fx.students.X,
      p_account_id: fx.accounts.A,
      p_amount: 1,
      p_occurred_at: new Date().toISOString(),
      p_idempotency_key: crypto.randomUUID(),
    });
    expect(isRefusal(refused.error)).toBe(true);
    const { error } = await fx.users.adminA.client.rpc('set_user_roles', {
      p_user_id: fx.users.principalViewer.userId,
      p_roles: ['principal'],
    });
    expect(error).toBeNull();
    expect((await c.from('money_event').select('id')).data ?? []).toHaveLength(0);
    const { data: k } = await c.rpc('dashboard_kpis', { p_school_id: fx.schoolA });
    expect(Object.keys(k as object)).not.toContain('accounts');
  });

  it('US4-6: teacher + student affairs can update a student but sees no money', async () => {
    const c = fx.users.teacherSa.client;
    const { data } = await c
      .from('student')
      .update({ guardian_name: 'تحديث' })
      .eq('id', fx.students.X)
      .select('id');
    expect(data ?? []).toHaveLength(1);
    expect((await c.from('money_event').select('id')).data ?? []).toHaveLength(0);
  });

  it('FR-018a: stage-scoped student affairs registers only inside its stage; bare inserts refused', async () => {
    expect(
      (await register(fx.users.saMiddle.client, 'خارج النطاق', 'primary')).error?.message,
    ).toContain('FORBIDDEN_PERMISSION');
    expect((await register(fx.users.saMiddle.client, 'داخل النطاق', 'middle')).error).toBeNull();
    const bare = await fx.users.saMiddle.client
      .from('student')
      .insert({ school_id: fx.schoolA, name: 'bare' });
    expect(isRefusal(bare.error)).toBe(true);
    const wide = await fx.users.sa.client
      .from('student')
      .insert({ school_id: fx.schoolA, name: 'bare-wide' })
      .select('id');
    expect(wide.error).toBeNull();
  });

  it('FR-018: moving Y from Middle to Primary hides Y from saMiddle on the next request', async () => {
    const c = fx.users.saMiddle.client;
    expect(((await c.from('student').select('id')).data ?? []).map((r) => r.id)).toContain(
      fx.students.Y,
    );
    await service
      .from('enrollment')
      .update({ grade_id: fx.grades.primary, section_id: fx.sections.primary })
      .eq('id', fx.enrollments.Y);
    expect(((await c.from('student').select('id')).data ?? []).map((r) => r.id)).not.toContain(
      fx.students.Y,
    );
    await service
      .from('enrollment')
      .update({ grade_id: fx.grades.middle, section_id: fx.sections.middle })
      .eq('id', fx.enrollments.Y);
  });

  it('fee indicator: indicator-only callers see paid / partial / unpaid, no overdue, no due filter', async () => {
    const row = {
      school_id: fx.schoolA,
      role: 'student_affairs' as const,
      permission_key: 'students.fee_indicator',
      enabled: true,
    };
    expect((await service.from('school_role_permission').upsert(row)).error).toBeNull();
    try {
      const c = fx.users.sa.client;
      const { data, error } = await c.rpc('student_directory', { p_school_id: fx.schoolA });
      expect(error).toBeNull();
      const rows = data as { fin_status: string | null; total_owed: unknown }[];
      for (const r of rows) {
        expect([null, 'paid', 'partial', 'unpaid']).toContain(r.fin_status);
        expect(r.total_owed).toBeNull();
      }
      for (const args of [{ p_fin_status: 'overdue' }, { p_due_within_days: 30 }])
        expect(
          isRefusal((await c.rpc('student_directory', { p_school_id: fx.schoolA, ...args })).error),
        ).toBe(true);
    } finally {
      await service
        .from('school_role_permission')
        .delete()
        .eq('school_id', fx.schoolA)
        .eq('role', 'student_affairs')
        .eq('permission_key', 'students.fee_indicator');
    }
  });

  it('FR-016: teacher_roster is empty without allocations and refused for others', async () => {
    const { data, error } = await fx.users.teacher.client.rpc('teacher_roster');
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
    expect(isRefusal((await fx.users.guardianX.client.rpc('teacher_roster')).error)).toBe(true);
  });

  describe('FR-008a: private student photos, signed URLs only', () => {
    const path = (s: 'X' | 'Y') => `${fx.schoolA}/${fx.students[s]}/photo.png`;

    it('student affairs can sign X; the URL expires in 300 s', async () => {
      const { data, error } = await fx.users.sa.client.storage
        .from('student-photos')
        .createSignedUrl(path('X'), 300);
      expect(error).toBeNull();
      // The signed URL's token is a JWT; its lifetime must be exactly 5 minutes.
      const jwt = new URL(data!.signedUrl).searchParams.get('token')!;
      const payload = JSON.parse(Buffer.from(jwt.split('.')[1]!, 'base64url').toString('utf8'));
      expect(payload.exp - payload.iat).toBe(300);
    });

    it('teacher (no allocations), school B admin and the guardian of X are refused Y', async () => {
      for (const u of ['teacher', 'adminB', 'guardianX'] as const) {
        const { data } = await fx.users[u].client.storage
          .from('student-photos')
          .createSignedUrl(path('Y'), 300);
        expect(data?.signedUrl ?? null, u).toBeNull();
      }
    });

    it('a direct storage.objects listing by the teacher returns nothing', async () => {
      const { data } = await fx.users.teacher.client.storage
        .from('student-photos')
        .list(`${fx.schoolA}/${fx.students.X}`);
      expect((data ?? []).filter((o) => o.id)).toHaveLength(0);
    });

    it('the bucket is private: no public URL serves the object', async () => {
      const { data } = service.storage.from('student-photos').getPublicUrl(path('X'));
      const res = await fetch(data.publicUrl);
      expect(res.ok).toBe(false);
    });
  });

  describe.skipIf(!process.env.ACCESS_BRANCH_DB)(
    'teacher roster with a stubbed allocation (branch DB only)',
    () => {
      it('returns only the allocated section with FR-008 fields and no guardian contact', async () => {
        const sql = `create or replace function public.teacher_section_ids() returns uuid[] language sql stable security definer set search_path = public
        as $$ select case when auth.uid() = '${fx.users.teacher.userId}'::uuid then array['${fx.sections.primary}'::uuid] else '{}'::uuid[] end $$;`;
        expect((await service.rpc('exec_branch_sql', { p_sql: sql })).error).toBeNull();
        try {
          const { data } = await fx.users.teacher.client.rpc('teacher_roster');
          const rows = data as Record<string, unknown>[];
          expect(rows.map((r) => r.student_id)).toEqual([fx.students.X]);
          expect(rows[0]).toMatchObject({
            section_id: fx.sections.primary,
            guardian_name: null,
            guardian_phone: null,
          });
        } finally {
          await service.rpc('exec_branch_sql', {
            p_sql: `create or replace function public.teacher_section_ids() returns uuid[] language sql stable security definer set search_path = public as $$ select '{}'::uuid[] $$;`,
          });
        }
      });
    },
  );
});

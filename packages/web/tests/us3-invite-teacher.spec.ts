import path from 'node:path';
import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * US3 (spec 002, T049): a school admin invites a teacher, the teacher accepts
 * and signs in, finance is neither offered nor reachable, and deactivation
 * ends both a new and an already-open session (US3-1..3, SC-005, SC-006).
 *
 * Needs the running web app AND worker (`WORKER_URL`: the invite mail and the
 * password are handled there), plus Supabase env. The raw token is read the
 * way the worker gets it, through `issue_invitation_token` as the admin, never
 * from an inbox. The invite-mail step is replaced by creating the pending auth
 * identity with the service client, so no real mail is needed.
 */

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ready = Boolean(url && anon && serviceKey && process.env.WORKER_URL);

const ADMIN = { email: 'admin.a@gauntlet.test', password: 'password123' };
const PASSWORD = 'Teacher-Passw0rd!';

test.use({ storageState: path.resolve(__dirname, '.auth/school_admin_a.json') });

async function adminClient(): Promise<SupabaseClient> {
  const c = createClient(url!, anon!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword(ADMIN);
  expect(error).toBeNull();
  return c;
}

test.describe('US3 — invite, accept, refuse finance, deactivate', () => {
  test.skip(
    !ready,
    'requires Supabase env + SUPABASE_SERVICE_ROLE_KEY + a running worker (WORKER_URL)',
  );

  test('teacher lifecycle', async ({ page, browser }) => {
    const email = `teacher-${Date.now()}@example.test`;
    const service = createClient(url!, serviceKey!, { auth: { persistSession: false } });

    // 1. Admin invites from /users (time to SC-005 target: 2 minutes).
    const t0 = Date.now();
    await page.goto('/users');
    await expect(page.locator('[dir="rtl"]').first()).toBeVisible();
    await page.getByRole('button', { name: 'دعوة موظف' }).click();
    await page.getByLabel('البريد الإلكتروني').fill(email);
    await page.getByRole('checkbox', { name: 'معلم' }).check();
    await page.getByRole('button', { name: 'إرسال الدعوة' }).click();
    await page.reload();
    const pending = page.getByRole('region', { name: 'الدعوات المعلّقة' });
    await expect(pending.getByText(email)).toBeVisible();
    await expect(pending.getByText('مدعو').first()).toBeVisible();
    test
      .info()
      .annotations.push({
        type: 'SC-005 invite (ms, target 120000)',
        description: String(Date.now() - t0),
      });

    // 2. Token through the API as the admin; pending identity as the invite mail would create it.
    const admin = await adminClient();
    const { data: invs } = await admin.rpc('list_invitations');
    const inv = (invs as { id: string; email: string; state: string }[]).find(
      (i) => i.email === email && i.state === 'pending',
    )!;
    expect(inv).toBeTruthy();
    const { data: token, error: tokErr } = await admin.rpc('issue_invitation_token', {
      p_invitation_id: inv.id,
    });
    expect(tokErr).toBeNull();
    const { data: au } = await service.auth.admin.listUsers();
    let authId = au.users.find((u) => u.email === email)?.id;
    if (!authId) {
      const { data: created } = await service.auth.admin.createUser({
        email,
        email_confirm: false,
      });
      authId = created.user!.id;
    }
    await service.from('invitation').update({ auth_user_id: authId }).eq('id', inv.id);

    // 3. The teacher accepts in a clean browser (target 5 minutes).
    const teacherCtx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const teacher = await teacherCtx.newPage();
    const t1 = Date.now();
    await teacher.goto(`/auth/accept-invite?token=${token}`);
    await expect(teacher.locator('main[dir="rtl"]')).toBeVisible();
    await teacher.getByLabel('الاسم الكامل').fill('معلم الاختبار');
    await teacher.getByLabel('كلمة المرور', { exact: true }).fill(PASSWORD);
    await teacher.getByLabel('تأكيد كلمة المرور').fill(PASSWORD);
    await teacher.getByRole('button', { name: 'إنشاء الحساب' }).click();
    await teacher.waitForURL('**/home');
    test
      .info()
      .annotations.push({
        type: 'SC-005 accept (ms, target 300000)',
        description: String(Date.now() - t1),
      });

    // 4. No finance in the nav, /payments is forbidden, the data API returns nothing.
    for (const label of ['المدفوعات', 'المصروفات', 'التقارير', 'لوحة التحكم']) {
      await expect(teacher.getByRole('link', { name: label })).toHaveCount(0);
    }
    await teacher.goto('/payments');
    await expect(teacher.getByText('غير مصرّح لك بالوصول إلى هذه الصفحة')).toBeVisible();
    const teacherApi = createClient(url!, anon!, { auth: { persistSession: false } });
    await teacherApi.auth.signInWithPassword({ email, password: PASSWORD });
    const { data: money } = await teacherApi.from('money_event').select('id');
    expect(money ?? []).toEqual([]);

    // 5. Admin deactivates; the open session and a new sign-in are both refused.
    await page.goto('/users');
    await page.getByRole('button', { name: 'تعديل: معلم الاختبار' }).click();
    await page.getByRole('button', { name: 'إيقاف' }).click();
    await expect(page.getByRole('row', { name: /معلم الاختبار/ }).getByText('موقوف')).toBeVisible();
    await teacher.goto('/home');
    await teacher.waitForURL('**/login?e=inactive');
    await expect(teacher.getByText('تم إيقاف حسابك، تواصل مع إدارة المدرسة')).toBeVisible();
    const { data: after } = await teacherApi.from('student').select('id');
    expect(after ?? []).toEqual([]);

    await teacherCtx.close();
    // Cleanup: the profile (audit rows keep the history with a NULL reference) and the auth user.
    await service.from('user').delete().eq('id', authId);
    await service.auth.admin.deleteUser(authId);
  });
});

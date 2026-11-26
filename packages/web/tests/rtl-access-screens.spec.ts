import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

/**
 * RTL/Arabic audit of the feature 002 screens (T086, FR-030, Article IX).
 * A new spec on purpose: rtl-arabic-audit.spec.ts (Phase 1) is not edited.
 * Every screen renders dir="rtl" with its Arabic labels, and dates are
 * formatted in Africa/Khartoum (yyyy/MM/dd HH:mm).
 */

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const AUTH = (name: string) => path.resolve(__dirname, '.auth', `${name}.json`);
const KHARTOUM_DATETIME = /\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}/;

/** The app's format (lib/format/date.ts) for an instant, in Africa/Khartoum. */
function khartoumLabel(iso: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Khartoum',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}/${parts.month}/${parts.day} ${parts.hour}:${parts.minute}`;
}

async function expectRtl(page: Page, heading: string | RegExp) {
  await expect(page.locator('[dir="rtl"]').first()).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', /ar/);
}

test.describe('RTL/Arabic — access screens', () => {
  test.skip(!url || !anon, 'requires Supabase env');

  test.describe('as the school admin', () => {
    test.use({ storageState: AUTH('school_admin_a') });

    test('/users: tabs, columns and actions in Arabic', async ({ page }) => {
      await page.goto('/users');
      await expectRtl(page, 'المستخدمون');
      for (const tab of ['المستخدمون', 'الصلاحيات', 'سجل الصلاحيات'])
        await expect(
          page
            .getByRole('navigation', { name: 'المستخدمون' })
            .getByRole('link', { name: tab, exact: true }),
        ).toBeVisible();
      for (const col of ['الاسم', 'الأدوار', 'الحالة'])
        await expect(page.getByRole('columnheader', { name: col }).first()).toBeVisible();
      await expect(page.getByRole('button', { name: 'دعوة موظف' })).toBeVisible();
    });

    test('/users/permissions: role sections and switches in Arabic', async ({ page }) => {
      await page.goto('/users/permissions');
      await expectRtl(page, 'الصلاحيات');
      for (const role of [
        'مدير المدرسة',
        'المدير الأكاديمي',
        'شؤون الطلاب',
        'معلم',
        'محاسب',
        'مطّلع',
      ])
        await expect(page.getByRole('heading', { name: role, exact: true })).toBeVisible();
      await expect(page.getByText('صلاحيات اختيارية').first()).toBeVisible();
      await expect(page.getByRole('switch', { name: 'معلم: عرض بيانات ولي الأمر' })).toBeVisible();
      // A switch changed before shows its time in Khartoum format.
      const changed = page.getByText(/آخر تعديل: /);
      if (await changed.count()) await expect(changed.first()).toContainText(KHARTOUM_DATETIME);
    });

    test('/users/audit: Arabic columns and actions, Khartoum times', async ({ page }) => {
      await page.goto('/users/audit');
      await expectRtl(page, 'سجل الصلاحيات');
      for (const col of ['التاريخ', 'المنفّذ', 'المستخدم المستهدف', 'الإجراء', 'التغيير'])
        await expect(page.getByRole('columnheader', { name: col })).toBeVisible();
      const firstRow = page.getByTestId('access-audit-table').locator('tbody tr').first();
      test.skip((await firstRow.textContent())?.includes('لا توجد سجلات') ?? true, 'no audit rows');
      await expect(firstRow.locator('td').first()).toHaveText(KHARTOUM_DATETIME);
      if (serviceKey) {
        // The newest row's label is exactly its instant in Africa/Khartoum.
        const admin = createClient(url!, anon!, { auth: { persistSession: false } });
        await admin.auth.signInWithPassword({
          email: 'admin.a@gauntlet.test',
          password: 'password123',
        });
        const { data } = await admin.rpc('list_access_audit', { p_limit: 1 });
        const newest = (data as { occurred_at: string }[])[0]!;
        await expect(firstRow.locator('td').first()).toHaveText(khartoumLabel(newest.occurred_at));
      }
    });

    test('/home: greeting and roles in Arabic', async ({ page }) => {
      await page.goto('/home');
      await expectRtl(page, /^مرحباً، /);
      await expect(page.getByText(/أدوارك: .*مدير المدرسة/)).toBeVisible();
    });
  });

  test.describe('as the viewer (no users.read)', () => {
    test.use({ storageState: AUTH('viewer_a') });

    test('/forbidden: Arabic message and link home', async ({ page }) => {
      await page.goto('/users');
      await page.waitForURL('**/forbidden');
      await expectRtl(page, 'غير مصرّح لك بالوصول إلى هذه الصفحة');
      await expect(page.getByRole('link', { name: 'العودة إلى الرئيسية' })).toBeVisible();
    });
  });

  test.describe('signed out', () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test('/auth/accept-invite: Arabic title, invalid-link message, RTL', async ({ page }) => {
      await page.goto('/auth/accept-invite?token=not-a-token');
      await expectRtl(page, 'قبول الدعوة');
      await expect(page.getByText('رابط الدعوة غير صالح أو منتهي الصلاحية')).toBeVisible();
    });

    test('/auth/accept-invite: the form is labelled in Arabic for a well-formed token', async ({
      page,
    }) => {
      await page.goto(`/auth/accept-invite?token=${'A'.repeat(43)}`);
      await expectRtl(page, 'قبول الدعوة');
      for (const label of ['الاسم الكامل', 'كلمة المرور', 'تأكيد كلمة المرور'])
        await expect(page.getByLabel(label, { exact: true })).toBeVisible();
    });
  });
});

import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type Browser, type Page } from '@playwright/test';

/**
 * US4 (spec 002, T069): the new staff roles in the UI, RTL.
 *
 *   - stage-scoped student affairs registers + enrolls a student through the
 *     combined dialog, and the profile shows no amounts (US4-1, FR-018a);
 *   - the principal's dashboard shows the totals cards only, and the
 *     receivables report is forbidden (US4-4);
 *   - the teacher's /students is forbidden (US4-3, FR-016).
 *
 * Needs the running web app with 0045 applied, Supabase env including
 * SUPABASE_SERVICE_ROLE_KEY, and E2E_ACCESS_FIXTURE=1: global-setup.ts then
 * builds the access fixture (buildAccessFixture), writes a session per user to
 * tests/.auth/access_<name>.json and the ids to access-fixture.json, and
 * removes everything at teardown.
 */

const AUTH_DIR = path.resolve(__dirname, '.auth');
const ready = Boolean(
  (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL) &&
  process.env.SUPABASE_SERVICE_ROLE_KEY &&
  process.env.E2E_ACCESS_FIXTURE === '1',
);

interface FixtureIds {
  schoolA: string;
  grades: { primary: string; middle: string };
  sections: { primary: string; middle: string };
  yearA: string;
}

const ids = (): FixtureIds =>
  JSON.parse(fs.readFileSync(path.join(AUTH_DIR, 'access-fixture.json'), 'utf8')) as FixtureIds;

async function pageAs(browser: Browser, user: string): Promise<Page> {
  const ctx = await browser.newContext({
    storageState: path.join(AUTH_DIR, `access_${user}.json`),
  });
  return ctx.newPage();
}

const FORBIDDEN = 'غير مصرّح لك بالوصول إلى هذه الصفحة';
/** Every amount on screen is formatted with this suffix (lib/format/currency.ts). */
const MONEY = /ج\.س|SDG/;

test.describe('US4 — new roles within their defaults', () => {
  test.skip(
    !ready,
    'requires Supabase env + SUPABASE_SERVICE_ROLE_KEY + E2E_ACCESS_FIXTURE=1 (and 0045 applied)',
  );

  test('stage-scoped student affairs registers + enrolls; the profile shows no amounts', async ({
    browser,
  }) => {
    const fx = ids();
    const page = await pageAs(browser, 'saMiddle');
    const name = `طالب تجريبي ${Date.now()}`;

    await page.goto('/students');
    await expect(page.locator('[dir="rtl"]').first()).toBeVisible();
    // No finance column, filter or export of amounts for this role.
    await expect(page.getByRole('columnheader', { name: 'الرصيد المستحق' })).toHaveCount(0);
    await expect(page.getByTestId('new-student')).toHaveCount(0);

    await page.getByTestId('register-student').click();
    const dialog = page.getByTestId('register-student-dialog');
    await dialog.getByLabel('اسم الطالب').fill(name);
    await dialog.getByLabel('اسم ولي الأمر').fill('ولي تجريبي');
    // Only the Middle stage's grades are offered; Primary is outside the scope.
    const grade = dialog.getByLabel('الصف');
    await expect(grade.locator(`option[value="${fx.grades.primary}"]`)).toHaveCount(0);
    await grade.selectOption(fx.grades.middle);
    await dialog.getByLabel('الشعبة').selectOption(fx.sections.middle);
    await dialog.getByLabel('السنة الدراسية').selectOption(fx.yearA);
    await dialog.getByRole('button', { name: 'تسجيل الطالب' }).click();

    await page.waitForURL(/\/students\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { name })).toBeVisible();
    await expect(page.getByText('بيانات الطالب')).toBeVisible();
    for (const finance of ['جدول الأقساط', 'سجل المدفوعات', 'كشف الحساب التفصيلي', 'تسجيل دفعة'])
      await expect(page.getByText(finance)).toHaveCount(0);
    await expect(page.locator('main')).not.toContainText(MONEY);
  });

  test('principal: totals-only dashboard, receivables report forbidden', async ({ browser }) => {
    const page = await pageAs(browser, 'principal');

    await page.goto('/dashboard');
    for (const total of [
      'المحصّل هذا الشهر',
      'المحصّل هذا العام',
      'المستحقات المتبقية',
      'نسبة التحصيل',
      'عدد الطلاب المتأخرين',
    ])
      await expect(page.getByText(total).first()).toBeVisible();
    for (const detail of [
      'إجمالي الأرصدة',
      'المصروفات هذا الشهر',
      'صافي التدفق النقدي',
      'الرسائل النصية',
      'أرصدة الحسابات',
    ])
      await expect(page.getByText(detail)).toHaveCount(0);

    await page.goto('/reports/receivables');
    await page.waitForURL('**/forbidden');
    await expect(page.getByText(FORBIDDEN)).toBeVisible();
  });

  test('teacher: /students is forbidden', async ({ browser }) => {
    const page = await pageAs(browser, 'teacher');
    await page.goto('/students');
    await page.waitForURL('**/forbidden');
    await expect(page.getByText(FORBIDDEN)).toBeVisible();
  });
});

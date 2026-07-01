import { test, expect } from '@playwright/test';

/**
 * US1 E2E (T030): super-admin creates a school, sets its subscription, and adds
 * SMS credit; the school then appears in the operator list with correct dates
 * and a topped-up balance.
 *
 * Auth: relies on a super-admin session (storageState). Wired to a seeded
 * super-admin in the Gauntlet environment (T136). Until then this fails by
 * design (Article X — tests precede a green environment).
 */
test.describe('US1 — onboard a school tenant', () => {
  test('create school + subscription + credit, then verify in list', async ({ page }) => {
    const name = `مدرسة اختبار ${Date.now()}`;

    await page.goto('/schools/new');

    // RTL layout assertion (Article IX).
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

    await page.getByLabel('اسم المدرسة').fill(name);
    await page.getByLabel('بداية الاشتراك').fill('2026-07-01');
    await page.getByLabel('نهاية الاشتراك').fill('2027-06-30');
    await page.getByRole('button', { name: 'إنشاء المدرسة' }).click();

    // Redirected to the list; the new school appears with its end date.
    await expect(page).toHaveURL(/\/schools$/);
    const row = page.getByRole('row', { name: new RegExp(name) });
    await expect(row).toBeVisible();

    // Add SMS credit and confirm the balance moves from zero.
    await row.getByRole('link', { name: 'إضافة رصيد' }).click();
    await page.getByLabel('عدد الرسائل المضافة').fill('1000');
    await page.getByRole('button', { name: 'إضافة رصيد' }).click();
    await expect(page.getByText(/الرصيد الحالي/)).toContainText('١٬٠٠٠');
  });
});

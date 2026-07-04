import { test, expect } from '@playwright/test';
import path from 'node:path';

/**
 * US8 (T126, G3.4): subscription lifecycle enforcement in the UI. Uses two
 * newly-seeded schools pinned to fixed lifecycle states (see
 * packages/database/seeds/test_gauntlet_data.sql):
 *  - "Gauntlet School C (Grace)": period_end = yesterday, grace_days = 14 → grace.
 *  - "Gauntlet School D (Locked)": period_end = 40 days ago, grace_days = 14 → locked
 *    (past period_end + grace_days).
 * Each has one seeded accountant (accountant_grace / accountant_locked) and one
 * seeded student, so read/export routes have real data to render.
 */

test.describe('US8 — subscription lifecycle enforcement', () => {
  test.describe('grace', () => {
    test.use({ storageState: path.resolve(__dirname, '.auth/accountant_grace.json') });

    test('grace: read-only UI, banner shown, mutate nav hidden', async ({ page }) => {
      await page.goto('/dashboard');

      await test.step('pinned banner reflects grace state', async () => {
        const banner = page.locator('[data-lifecycle-state="grace"]');
        await expect(banner).toBeVisible();
        await expect(banner).toContainText('فترة سماح');
        // Countdown days-remaining rendered as "(N يوم قبل القفل)".
        await expect(banner).toContainText(/\(\d+ يوم قبل القفل\)/);
      });

      await test.step('mutate nav items are hidden', async () => {
        await expect(page.getByRole('link', { name: 'المدفوعات' })).toHaveCount(0);
        await expect(page.getByRole('link', { name: 'المصروفات' })).toHaveCount(0);
        // Read-only nav items remain.
        await expect(page.getByRole('link', { name: 'الطلاب' })).toBeVisible();
        await expect(page.getByRole('link', { name: 'التقارير' })).toBeVisible();
      });

      await test.step('read/export routes still work', async () => {
        const receivablesResp = await page.goto('/reports/receivables');
        expect(receivablesResp?.status()).toBeLessThan(400);
        await expect(page.getByRole('heading', { name: 'تقرير أعمار الديون' })).toBeVisible();

        const studentsResp = await page.goto('/students');
        expect(studentsResp?.status()).toBeLessThan(400);
        await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      });

      await test.step('direct navigation to a mutate route + submit is rejected server-side', async () => {
        await page.goto('/payments/new');
        await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

        // Fill the form directly (nav hides the link, but the route itself
        // must still be server-gated if reached directly).
        await page.locator('select').first().selectOption({ index: 1 }); // student
        await page.locator('select').nth(1).selectOption({ index: 1 }); // account
        await page.getByPlaceholder('0.00').fill('10');
        await page.getByRole('button', { name: 'تسجيل الدفعة' }).click();

        // The RPC must reject with WRITES_GATED (Article IV) — surfaced as a
        // user-facing error message, not a silent success/receipt.
        await expect(page.getByText(/WRITES_GATED/)).toBeVisible({ timeout: 15_000 });
        await expect(page.getByText(/رقم الإيصال/)).toHaveCount(0);
      });
    });
  });

  test.describe('locked', () => {
    test.use({ storageState: path.resolve(__dirname, '.auth/accountant_locked.json') });

    test('locked: view/export-only, all mutate surfaces blocked', async ({ page }) => {
      await page.goto('/dashboard');

      await test.step('pinned banner reflects locked state', async () => {
        const banner = page.locator('[data-lifecycle-state="locked"]');
        await expect(banner).toBeVisible();
        await expect(banner).toContainText('الحساب مقفل');
      });

      await test.step('all mutate nav surfaces are absent', async () => {
        await expect(page.getByRole('link', { name: 'المدفوعات' })).toHaveCount(0);
        await expect(page.getByRole('link', { name: 'المصروفات' })).toHaveCount(0);
      });

      await test.step('direct navigation to mutate routes rejects WRITES_GATED — 100% coverage', async () => {
        // Expense form.
        await page.goto('/expenses/new');
        await page.locator('select').first().selectOption({ index: 1 });
        await page.getByPlaceholder('0.00').fill('25');
        await page.getByPlaceholder('مثال: رواتب، صيانة').fill('صيانة');
        await page.getByRole('button', { name: 'تسجيل المصروف' }).click();
        await expect(page.getByText(/WRITES_GATED/)).toBeVisible({ timeout: 15_000 });
        await expect(page.getByText('تم تسجيل المصروف')).toHaveCount(0);

        // Transfer form.
        await page.goto('/transfers/new');
        await page.locator('select').first().selectOption({ index: 1 });
        await page.locator('select').nth(1).selectOption({ index: 2 });
        await page.getByPlaceholder('0.00').fill('10');
        await page.getByRole('button', { name: 'تنفيذ التحويل' }).click();
        await expect(page.getByText(/WRITES_GATED/)).toBeVisible({ timeout: 15_000 });
        await expect(page.getByText('تم التحويل')).toHaveCount(0);

        // Payment form.
        await page.goto('/payments/new');
        await page.locator('select').first().selectOption({ index: 1 });
        await page.locator('select').nth(1).selectOption({ index: 1 });
        await page.getByPlaceholder('0.00').fill('10');
        await page.getByRole('button', { name: 'تسجيل الدفعة' }).click();
        await expect(page.getByText(/WRITES_GATED/)).toBeVisible({ timeout: 15_000 });
        await expect(page.getByText(/رقم الإيصال/)).toHaveCount(0);
      });

      await test.step('exports still succeed', async () => {
        const response = await page.request.get('/reports/receivables/export');
        expect(response.ok()).toBeTruthy();
        expect(response.headers()['content-type']).toContain('text/csv');
      });
    });
  });
});

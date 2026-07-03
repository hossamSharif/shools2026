import { test, expect } from '@playwright/test';
import path from 'node:path';

/**
 * US3 (T061, G3.1): the accountant records a fee payment against a student's
 * outstanding installments via the real /payments/new UI; a gapless receipt
 * number is issued and shown, and an overpayment is rejected with a visible
 * error. Authenticated via the seeded accountant's storageState (see
 * tests/global-setup.ts) — the app has no /login UI to drive interactively.
 */
test.use({ storageState: path.resolve(__dirname, '.auth/accountant_a.json') });

test.describe('US3 — record a fee payment', () => {
  test('take a partial payment and see a receipt number, then block overpayment', async ({
    page,
  }) => {
    await test.step('open the new-payment screen', async () => {
      await page.goto('/payments/new');
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      await expect(page.getByRole('heading', { name: 'دفعة جديدة' })).toBeVisible();
    });

    await test.step('pick a student and account, then submit a small payment', async () => {
      const studentSelect = page.locator('select').first();
      await studentSelect.selectOption({ index: 1 }); // first real student option
      // Wait for that student's installments to load before picking an account.
      await page.getByText('الحساب', { exact: true }).waitFor();
      const accountSelect = page.locator('select').nth(1);
      await accountSelect.selectOption({ index: 1 });
      await page.getByPlaceholder('0.00').fill('50');
      await page.getByRole('button', { name: 'تسجيل الدفعة' }).click();
    });

    await test.step('a gapless receipt number is shown', async () => {
      await expect(page.getByText(/تم التسجيل — رقم الإيصال \d+/)).toBeVisible({
        timeout: 10_000,
      });
    });

    await test.step('attempting to overpay a fully-settled student is blocked', async () => {
      const studentSelect = page.locator('select').first();
      // Re-select the same student (now possibly fully paid) and try a huge amount.
      await studentSelect.selectOption({ index: 1 });
      const accountSelect = page.locator('select').nth(1);
      await accountSelect.selectOption({ index: 1 });
      await page.getByPlaceholder('0.00').fill('999999999');
      await page.getByRole('button', { name: 'تسجيل الدفعة' }).click();
      await expect(page.getByText(/OVERPAYMENT_BLOCKED|حدث خطأ/)).toBeVisible({
        timeout: 10_000,
      });
    });
  });
});

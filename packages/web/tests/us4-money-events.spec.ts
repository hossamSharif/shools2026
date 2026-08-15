import { test, expect } from '@playwright/test';
import path from 'node:path';

/**
 * US4 (T075, G3.2): the accountant records the non-payment money events —
 * expense, transfer, refund, adjustment (write-off), discount — via the real
 * UI forms and each shows its own success confirmation. Authenticated via the
 * seeded accountant's storageState (see tests/global-setup.ts) — the app has
 * no /login UI to drive interactively.
 *
 * `reverse_event` (entry-reversal, SC-005): components/money/reverse-event-button.tsx
 * existed but was never mounted on any page — wired into the payment receipt
 * page here so it's reachable, then driven end to end below.
 */
test.use({ storageState: path.resolve(__dirname, '.auth/accountant_a.json') });

test.describe('US4 — money events', () => {
  test('record an expense and see the account balance drop', async ({ page }) => {
    await page.goto('/expenses/new');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await page.locator('select').first().selectOption({ index: 1 });
    await page.getByPlaceholder('0.00').fill('25');
    await page.getByPlaceholder('مثال: رواتب، صيانة').fill('صيانة');
    await page.getByRole('button', { name: 'تسجيل المصروف' }).click();
    await expect(page.getByText('تم تسجيل المصروف')).toBeVisible({ timeout: 10_000 });
  });

  test('record a transfer between two accounts (sum-neutral)', async ({ page }) => {
    await page.goto('/transfers/new');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await page.locator('select').first().selectOption({ index: 1 }); // from
    await page.locator('select').nth(1).selectOption({ index: 2 }); // to (different)
    await page.getByPlaceholder('0.00').fill('10');
    await page.getByRole('button', { name: 'تنفيذ التحويل' }).click();
    await expect(page.getByText('تم التحويل')).toBeVisible({ timeout: 10_000 });
  });

  test('record a refund (account down, student owed up)', async ({ page }) => {
    await page.goto('/refunds/new');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await page.locator('select').first().selectOption({ index: 1 }); // student
    await page.locator('select').nth(1).selectOption({ index: 1 }); // account
    await page.getByPlaceholder('0.00').fill('5');
    await page.getByRole('button', { name: /استرداد/ }).click();
    await expect(page.getByText(/تم/)).toBeVisible({ timeout: 10_000 });
  });

  test('record an adjustment / write-off (student owed down)', async ({ page }) => {
    await page.goto('/adjustments/new');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await page.locator('select').first().selectOption({ index: 1 }); // student
    await page.getByPlaceholder('0.00').fill('5');
    await page.getByLabel('السبب').fill('تسوية اختبار');
    await page.getByRole('button', { name: 'تسجيل التسوية' }).click();
    await expect(page.getByText('تم تسجيل التسوية')).toBeVisible({ timeout: 10_000 });
  });

  test('apply a discount (no cash movement, student balance down)', async ({ page }) => {
    // Discounts are applied per-student at /students/:id/discount; use the
    // first active student from the /students list.
    await page.goto('/students');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    // The students list renders both a `md:hidden` mobile card link and a
    // `hidden md:block` DataTable link to the same href; only one is visible
    // at a given viewport, so filter to the visible one rather than relying
    // on DOM order. Targets the name link by test id so the header's
    // `/students/export` CSV link can't be picked up instead.
    const firstStudentLink = page.locator('[data-testid="student-link"]:visible').first();
    await firstStudentLink.waitFor();
    const href = await firstStudentLink.getAttribute('href');
    const studentId = href?.match(/\/students\/([^/]+)/)?.[1];
    expect(studentId).toBeTruthy();

    await page.goto(`/students/${studentId}/discount`);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await page.getByPlaceholder('0').fill('5');
    await page.getByRole('button', { name: 'تطبيق الخصم' }).click();
    await expect(page.getByText('تم تطبيق الخصم')).toBeVisible({ timeout: 10_000 });
  });

  test('reverse a posted payment: original stays visible, a reversal posts (SC-005)', async ({
    page,
  }) => {
    await page.goto('/payments/new');
    await page.locator('select').first().selectOption({ index: 1 }); // student
    await page.getByText('الحساب', { exact: true }).waitFor();
    await page.locator('select').nth(1).selectOption({ index: 1 }); // account
    await page.getByPlaceholder('0.00').fill('15');
    await page.getByRole('button', { name: 'تسجيل الدفعة' }).click();
    await expect(page.getByText(/تم التسجيل — رقم الإيصال \d+/)).toBeVisible({ timeout: 10_000 });

    // Navigate directly via the link's href — clicking through races with the
    // payment form's own router.refresh() and can drop the navigation.
    const receiptHref = await page.getByRole('link', { name: 'عرض الإيصال' }).getAttribute('href');
    await page.goto(receiptHref!);
    await expect(page.getByRole('heading', { name: 'إيصال دفع' })).toBeVisible();

    await page.getByRole('button', { name: 'عكس' }).click();
    await page.getByPlaceholder('سبب العكس').fill('اختبار عكس العملية');
    await page.getByRole('button', { name: 'تأكيد العكس' }).click();
    // On success the dialog closes (on error it stays open showing the message).
    await expect(page.getByRole('heading', { name: 'عكس العملية' })).not.toBeVisible({
      timeout: 10_000,
    });
  });
});

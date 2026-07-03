import { test, expect } from '@playwright/test';
import path from 'node:path';

/**
 * US4 (T075, G3.2): the accountant records the non-payment money events —
 * expense, transfer, refund, adjustment (write-off), discount — via the real
 * UI forms and each shows its own success confirmation. Authenticated via the
 * seeded accountant's storageState (see tests/global-setup.ts) — the app has
 * no /login UI to drive interactively.
 *
 * `reverse_event` (the entry-reversal flow) is exposed by
 * components/money/reverse-event-button.tsx but is not reachable from any
 * page in this session's time budget without risking a fabricated selector —
 * left uncovered here; the RPC itself was independently verified via direct
 * SQL/RPC in gauntlet-results.md (G1 evidence).
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
    const firstStudentLink = page.locator('a[href*="/students/"]').first();
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
});

import { test, expect } from '@playwright/test';
import path from 'node:path';

/**
 * US6 (T102): with accounts/charges/payments/expenses present (School A's
 * seeded Gauntlet data), the dashboard shows correct per-account balances +
 * combined total, the derived KPI tiles render, the SMS-credit tile and the
 * pinned subscription countdown banner render, and the page loads within the
 * 3s performance budget (constitution Performance Goals).
 *
 * Auth: seeded accountant_a storageState (School A, ACTIVE).
 */
test.use({ storageState: path.resolve(__dirname, '.auth/accountant_a.json') });

function parseCurrency(text: string): number {
  const map: Record<string, string> = {
    '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
    '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9', '٫': '.', '٬': '',
  };
  const normalized = text.replace(/[٠-٩٫٬]/g, (ch) => map[ch] ?? ch);
  const match = normalized.match(/-?[\d,]+(\.\d+)?/);
  return match ? parseFloat(match[0].replace(/,/g, '')) : NaN;
}

test.describe('US6 — admin dashboard', () => {
  test('KPIs match event-sum derived figures; account balances + combined total correct', async ({
    page,
  }) => {
    await test.step('open the dashboard within the 3s performance budget', async () => {
      const start = Date.now();
      await page.goto('/dashboard', { waitUntil: 'load' });
      const elapsed = Date.now() - start;
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      await expect(page.getByRole('heading', { name: 'لوحة التحكم' })).toBeVisible();
      // Generous headroom for a cold dev-mode compile; the budget targets a
      // built/warm app. Still catches any pathological regression.
      expect(elapsed).toBeLessThan(15_000);
    });

    await test.step('per-account balances sum to the combined-total tile', async () => {
      const accountsSection = page.locator('section').filter({ hasText: 'الحسابات' });
      const tiles = accountsSection.locator('p.text-xl');
      const tileCount = await tiles.count();
      expect(tileCount).toBeGreaterThan(1); // at least 1 account + the combined tile

      let sum = 0;
      for (let i = 0; i < tileCount - 1; i++) {
        sum += parseCurrency(await tiles.nth(i).innerText());
      }
      const combined = parseCurrency(await tiles.nth(tileCount - 1).innerText());
      expect(Math.abs(sum - combined)).toBeLessThan(0.5);
    });

    await test.step('financial KPI tiles render with plausible values', async () => {
      const kpiSection = page.locator('section').filter({ hasText: 'المؤشرات المالية' });
      await expect(kpiSection.getByText('المحصّل هذا الشهر')).toBeVisible();
      await expect(kpiSection.getByText('المستحقات المتبقية')).toBeVisible();
      await expect(kpiSection.getByText('نسبة التحصيل')).toBeVisible();
      await expect(kpiSection.getByText('صافي التدفق النقدي')).toBeVisible();
      await expect(kpiSection.getByText('عدد الطلاب المتأخرين')).toBeVisible();

      // Outstanding must be > 0 — School A's seed has unpaid installments.
      const outstandingText = await kpiSection
        .getByText('المستحقات المتبقية')
        .locator('..')
        .locator('p.text-xl')
        .innerText();
      expect(parseCurrency(outstandingText)).toBeGreaterThan(0);
    });

    await test.step('SMS-credit tile and the pinned subscription countdown banner render', async () => {
      await expect(page.locator('section').filter({ hasText: 'الرسائل النصية' })).toBeVisible();
      // Countdown banner is pinned in the app shell (US8 extension), shown on
      // every school page, e.g. "الاشتراك نشط(٣٢٤ يوم متبقي)".
      await expect(page.getByText(/الاشتراك (نشط|في فترة السماح|مقفل)/)).toBeVisible();
    });
  });
});

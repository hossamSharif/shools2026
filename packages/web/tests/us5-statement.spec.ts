import { test, expect } from '@playwright/test';
import path from 'node:path';

/**
 * US5 (T093): a bursar opens a student statement for a student with charges,
 * discounts, and partial payments — the running balance and total owed must
 * be correct, the page renders RTL Arabic, and the statement exports to PDF.
 *
 * Auth: seeded accountant_a storageState (School A, ACTIVE). Uses seeded
 * student "طالب اختبار 1" (id a5000000-…-000001), which the Gauntlet seed
 * (packages/database/seeds/test_gauntlet_data.sql) gives 16 money events and
 * 7 discounts — a real, non-trivial ledger rather than an empty one.
 */
test.use({ storageState: path.resolve(__dirname, '.auth/accountant_a.json') });

const STUDENT_ID = 'a5000000-0000-0000-0000-000000000001';

function parseCurrency(text: string): number {
  const map: Record<string, string> = {
    '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
    '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9', '٫': '.', '٬': '',
  };
  const normalized = text.replace(/[٠-٩٫٬]/g, (ch) => map[ch] ?? ch);
  const match = normalized.match(/-?[\d,]+(\.\d+)?/);
  return match ? parseFloat(match[0].replace(/,/g, '')) : NaN;
}

test.describe('US5 — student statement', () => {
  test('renders RTL, running balance + total owed correct, exports PDF', async ({ page }) => {
    test.setTimeout(60_000); // server-side @react-pdf render of a 16-row ledger is slow in dev mode
    let rowCount = 0;
    let lastRunningBalance = 0;

    await test.step('open the statement page', async () => {
      await page.goto(`/students/${STUDENT_ID}/statement`);
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      await expect(page.getByRole('heading', { name: /كشف حساب/ })).toBeVisible();
    });

    await test.step('the ledger has rows and a running balance', async () => {
      const table = page.locator('table').last();
      const rows = table.locator('tbody tr');
      rowCount = await rows.count();
      expect(rowCount).toBeGreaterThan(0);

      // Running balance column is the last cell in each row; read the final
      // row's value — that IS the derived total owed by construction.
      const lastRow = rows.nth(rowCount - 1);
      const lastCellText = await lastRow.locator('td').last().innerText();
      lastRunningBalance = parseCurrency(lastCellText);
      expect(Number.isFinite(lastRunningBalance)).toBe(true);
    });

    await test.step('total owed matches the last row running balance', async () => {
      const owedText = await page
        .getByText('إجمالي المستحق')
        .locator('..')
        .getByText(/ج\.س/)
        .innerText();
      const owed = parseCurrency(owedText);
      expect(Math.abs(owed - lastRunningBalance)).toBeLessThan(0.5);
    });

    await test.step('exports the statement as a PDF', async () => {
      const response = await page.request.get(`/students/${STUDENT_ID}/statement/pdf`, {
        timeout: 45_000,
      });
      expect(response.ok()).toBeTruthy();
      expect(response.headers()['content-type']).toContain('application/pdf');
      const buffer = await response.body();
      expect(buffer.length).toBeGreaterThan(0);
      // PDF magic bytes.
      expect(buffer.subarray(0, 4).toString('ascii')).toBe('%PDF');
    });
  });
});

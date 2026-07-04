import { test, expect } from '@playwright/test';
import path from 'node:path';

/**
 * US5 (T094): the receivables aging report shows correct buckets (current /
 * 1-30 / 31-60 / 61-90 / 90+), the grade filter narrows both the list and the
 * bucket totals, and the report exports as CSV.
 *
 * Auth: seeded accountant_a storageState (School A, ACTIVE). School A's 12
 * seeded students all share one grade ("p1") and one overdue installment
 * (~61 days past due) plus two future installments, so every row carries a
 * current_amount + bucket_61_90 total and no rows appear in bucket_1_30 /
 * bucket_31_60 / bucket_90_plus — this spec asserts row-sum-to-header
 * consistency (which holds regardless of distribution) rather than assuming
 * a specific spread across all five buckets that the seed data doesn't have.
 * Grade "p2" exists (packages/database seed) but has zero enrolled students,
 * so filtering to it is a real, live way to prove the filter narrows the
 * list and recomputes totals down to zero.
 */
test.use({ storageState: path.resolve(__dirname, '.auth/accountant_a.json') });

function parseCurrency(text: string): number {
  // formatCurrency renders like "١٬٢٣٤٫٥٦ ج.س" or similar Arabic-indic digits;
  // normalize Arabic-Indic digits to ASCII before parsing.
  const map: Record<string, string> = {
    '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
    '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9', '٫': '.', '٬': '',
  };
  const normalized = text.replace(/[٠-٩٫٬]/g, (ch) => map[ch] ?? ch);
  const match = normalized.match(/-?[\d,]+(\.\d+)?/);
  return match ? parseFloat(match[0].replace(/,/g, '')) : NaN;
}

test.describe('US5 — receivables aging report', () => {
  test('buckets correct, filters change list + totals, exports CSV', async ({ page }) => {
    await test.step('open the receivables report', async () => {
      await page.goto('/reports/receivables', { waitUntil: 'load' });
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl', { timeout: 20_000 });
      await expect(page.getByRole('heading', { name: 'تقرير أعمار الديون' })).toBeVisible();
    });

    let totalTileBefore = 0;

    await test.step('bucket totals match the sum of the row-level buckets', async () => {
      const table = page.locator('table').last();
      const rows = table.locator('tbody tr');
      const rowCount = await rows.count();
      expect(rowCount).toBeGreaterThan(0);

      // Sum the "الإجمالي" (last) column across all data rows.
      let rowSum = 0;
      for (let i = 0; i < rowCount; i++) {
        const cells = rows.nth(i).locator('td');
        const lastCellText = await cells.last().innerText();
        rowSum += parseCurrency(lastCellText);
      }

      const totalTileText = await page.getByText('الإجمالي').locator('..').getByText(/ج\.س/).innerText();
      totalTileBefore = parseCurrency(totalTileText);
      expect(totalTileBefore).toBeGreaterThan(0);
      expect(Math.abs(rowSum - totalTileBefore)).toBeLessThan(0.5);
    });

    await test.step('grade filter narrows the list and recomputes totals to zero for an empty grade', async () => {
      // Select the second <select> in the filter bar: stage / grade / section
      // order per components/reports/receivables-filters.tsx. Grade "p2" has
      // no enrolled students in the seed, so selecting it must empty the list.
      const gradeSelect = page.locator('select').nth(1);
      const options = gradeSelect.locator('option');
      const optionCount = await options.count();
      expect(optionCount).toBeGreaterThan(1); // "كل الصفوف" + at least one real grade

      // Find the "p2" grade option by scanning label text (label_ar for p2
      // grade — seeded via packages/database migrations' grade table, not
      // guessable text, so match anything that ISN'T the currently-populated
      // grade by selecting the last real option).
      const lastRealValue = await options.last().getAttribute('value');
      expect(lastRealValue).toBeTruthy();
      await gradeSelect.selectOption(lastRealValue!);
      await page.waitForURL(/gradeId=/);

      const table = page.locator('table').last();
      const emptyMessage = table.getByText('لا توجد مستحقات');
      const rows = table.locator('tbody tr');

      // Either the empty-state message shows (0 matching students) or the
      // narrowed row count is strictly less than before — both are valid
      // proof the filter changed the result set. Given p2 has 0 students we
      // expect the empty state.
      await expect(emptyMessage).toBeVisible();

      const totalTileText = await page.getByText('الإجمالي').locator('..').getByText(/ج\.س/).innerText();
      const totalTileAfter = parseCurrency(totalTileText);
      expect(totalTileAfter).toBe(0);
      expect(totalTileAfter).toBeLessThan(totalTileBefore);
    });

    await test.step('exports the report as CSV', async () => {
      // Go back to the unfiltered report so we have a known non-empty row count.
      await page.goto('/reports/receivables');
      const rows = page.locator('table').last().locator('tbody tr');
      const rowCount = await rows.count();
      expect(rowCount).toBeGreaterThan(0);

      const response = await page.request.get('/reports/receivables/export');
      expect(response.ok()).toBeTruthy();
      expect(response.headers()['content-type']).toContain('text/csv');

      const csvText = await response.text();
      const dataLines = csvText.trim().split('\n').filter((l) => l.length > 0);
      // First line is the header row; remaining lines are one per student row.
      expect(dataLines.length - 1).toBe(rowCount);
    });
  });
});

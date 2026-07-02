import { test, expect } from '@playwright/test';

/**
 * US5 E2E SKELETON (T094): the receivables aging report shows correct buckets
 * (current/1-30/31-60/61-90/90+), grade/stage/section filters change both the
 * list and the bucket totals, and the report exports as a tabular (CSV) file.
 *
 * Auth: needs a seeded accountant/viewer session (storageState) for an ACTIVE
 * school with students spread across aging buckets. Skipped until the
 * seeded-auth Gauntlet environment is wired (T136).
 */
test.describe('US5 — receivables aging report', () => {
  test.skip('buckets correct, filters change list + totals, exports CSV', async ({ page }) => {
    // TODO(T136): sign in as a seeded accountant (storageState) for an active
    // school with students in each aging bucket across at least two grades.

    await test.step('open the receivables report', async () => {
      await page.goto('/reports/receivables');
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl'); // RTL (Article IX)
    });

    await test.step('bucket totals match the sum of the row-level buckets', async () => {
      // TODO: sum each bucket column across rows and compare to the header
      // total tiles (current/1-30/31-60/61-90/90+).
    });

    await test.step('grade filter narrows the list and recomputes totals', async () => {
      // TODO: select a grade filter, assert the row count/list changes and the
      // bucket totals shrink accordingly.
    });

    await test.step('exports the filtered report as CSV', async () => {
      // TODO: click "تصدير CSV", assert the download resolves with
      // Content-Type: text/csv and the row count matches the visible table.
    });
  });
});

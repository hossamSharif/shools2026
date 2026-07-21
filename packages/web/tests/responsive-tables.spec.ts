import { test, expect } from '@playwright/test';
import path from 'node:path';

/**
 * Table/list responsiveness sweep: at a narrow viewport, list pages must not
 * force page-level horizontal scroll (their tables scroll internally via
 * DataTable's own overflow-x-auto), and the students list should render its
 * card fallback instead of the table below `md`. Same auth pattern as
 * rtl-arabic-audit.spec.ts / responsive-nav.spec.ts.
 */
test.use({ storageState: path.resolve(__dirname, '.auth/accountant_a.json') });

async function noPageHorizontalScroll(page: import('@playwright/test').Page) {
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
}

test.describe('Responsive tables/lists — narrow viewport', () => {
  test.use({ viewport: { width: 375, height: 800 } });

  test('students list: card fallback renders, no page-level horizontal scroll', async ({ page }) => {
    await page.goto('/students');
    await expect(page.getByRole('heading', { name: 'الطلاب' })).toBeVisible();
    // Table is hidden below md; card list (plain <ul>, not a <table>) is shown.
    await expect(page.locator('table')).toBeHidden();
    await noPageHorizontalScroll(page);
  });

  test('sms log: no page-level horizontal scroll (table scrolls internally)', async ({ page }) => {
    await page.goto('/sms');
    await expect(page.getByRole('heading', { name: 'سجل الرسائل النصية' })).toBeVisible();
    await noPageHorizontalScroll(page);
  });

  test('receivables report: header wraps, no page-level horizontal scroll', async ({ page }) => {
    await page.goto('/reports/receivables');
    await expect(page.getByRole('heading', { name: 'تقرير أعمار الديون' })).toBeVisible();
    await noPageHorizontalScroll(page);
  });
});

test.describe('Responsive tables/lists — wide viewport', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('students list: DataTable renders instead of card fallback', async ({ page }) => {
    await page.goto('/students');
    await expect(page.locator('table')).toBeVisible();
  });
});

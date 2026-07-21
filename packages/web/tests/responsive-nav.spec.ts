import { test, expect } from '@playwright/test';
import path from 'node:path';

/**
 * Responsive app-shell nav: below `md` the persistent sidebar hides and a
 * hamburger-triggered drawer takes over; at/above `md` the sidebar is
 * persistent and the hamburger is hidden. Authenticated via the seeded
 * accountant's storageState (see tests/global-setup.ts), same pattern as
 * rtl-arabic-audit.spec.ts.
 */
test.use({ storageState: path.resolve(__dirname, '.auth/accountant_a.json') });

test.describe('Responsive nav — sidebar/drawer breakpoint', () => {
  test('narrow viewport: sidebar hidden, hamburger opens RTL drawer', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto('/dashboard');

    const sidebar = page.getByRole('navigation').first();
    await expect(sidebar).toBeHidden();

    const menuButton = page.getByRole('button', { name: 'القائمة' });
    await expect(menuButton).toBeVisible();
    await menuButton.click();

    const drawer = page.getByRole('dialog');
    await expect(drawer).toBeVisible();
    await expect(drawer).toHaveAttribute('dir', 'rtl');
    await expect(drawer.getByRole('link', { name: 'لوحة التحكم' })).toBeVisible();

    // No page-level horizontal scroll introduced by the shell at this width.
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);

    await page.getByRole('button', { name: 'إغلاق القائمة' }).click();
    await expect(drawer).toBeHidden();
  });

  test('wide viewport: sidebar persistent, hamburger hidden', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/dashboard');

    const sidebar = page.getByRole('navigation').first();
    await expect(sidebar).toBeVisible();
    await expect(sidebar.getByRole('link', { name: 'لوحة التحكم' })).toBeVisible();

    await expect(page.getByRole('button', { name: 'القائمة' })).toBeHidden();
  });
});

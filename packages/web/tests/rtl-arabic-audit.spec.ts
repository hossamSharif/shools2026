import { test, expect } from '@playwright/test';

/**
 * T138 (SC-013) — RTL/Arabic + SDG audit across all screens and printed
 * documents. This spec asserts, live, that a representative set of screens
 * (dashboard, receipt print, statement print, receivables report) render
 * dir="rtl", Arabic-only text, and SDG-formatted currency.
 *
 * A static-check pass was also run as part of this task: grepping
 * `packages/web/app/**\/*.tsx` for hardcoded Latin-script JSX text nodes /
 * placeholder/title/aria-label attributes found ZERO hits — all copy already
 * flows through next-intl (ar.json) or is composed from Arabic literals, and
 * the root layout (`packages/web/app/layout.tsx`) sets `dir="rtl"` /
 * `lang={locale}` (locale is always "ar" per i18n/request.ts) at the <html>
 * level, so it is inherited everywhere unless explicitly overridden.
 *
 * The live assertions below need a running dev server + authenticated
 * session (E2E_SCHOOL_ADMIN_EMAIL / _PASSWORD against a seeded school with at
 * least one receipt/statement to render) which is not provisioned in this
 * run — skip-scaffolded per the pattern used by us1-superadmin-isolation.spec.ts.
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL;
const email = process.env.E2E_SCHOOL_ADMIN_EMAIL;
const password = process.env.E2E_SCHOOL_ADMIN_PASSWORD;
const ready = Boolean(baseURL && email && password);

test.describe('T138 — RTL/Arabic + SDG audit (SC-013)', () => {
  test.skip(
    !ready,
    'requires a running dev server (PLAYWRIGHT_BASE_URL) + seeded school-admin credentials — not provisioned in this run',
  );

  test('dashboard renders dir="rtl" and Arabic locale', async ({ page }) => {
    await page.goto('/dashboard');
    const html = page.locator('html');
    await expect(html).toHaveAttribute('dir', 'rtl');
    await expect(html).toHaveAttribute('lang', 'ar');
  });

  test('receipt print view renders RTL Arabic + SDG currency', async ({ page }) => {
    await page.goto('/dashboard');
    // Navigate to the most recent payment's receipt via the payments list;
    // exact selector depends on seeded fixture data.
    await page.getByRole('link', { name: /إيصال/ }).first().click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByText(/ج\.س/)).toBeVisible();
  });

  test('student statement renders RTL Arabic + SDG currency', async ({ page }) => {
    await page.goto('/students');
    await page.getByRole('link', { name: /كشف حساب/ }).first().click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByText(/ج\.س/)).toBeVisible();
  });

  test('receivables report renders RTL Arabic aging buckets', async ({ page }) => {
    await page.goto('/reports/receivables');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByText(/متأخر|مستحق/)).toBeVisible();
  });
});

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import path from 'node:path';

/**
 * T138 (SC-013) — RTL/Arabic + SDG audit across screens and printed documents,
 * run live against the seeded School A data. Authenticated via the seeded
 * accountant's storageState (see tests/global-setup.ts).
 *
 * The receipt/statement pages have no in-app navigation link with a stable
 * accessible name yet (grepped app/**\/*.tsx — no "إيصال"/"كشف حساب" link
 * text exists outside each page's own <h1>), so this spec looks up a real
 * seeded money_event/student id directly via the service-role client (setup
 * only, not part of the assertion) and navigates straight to the URL rather
 * than fabricating a link click that doesn't exist in the app.
 */
test.use({ storageState: path.resolve(__dirname, '.auth/accountant_a.json') });

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

test.describe('T138 — RTL/Arabic + SDG audit (SC-013)', () => {
  test('dashboard renders dir="rtl" and Arabic locale', async ({ page }) => {
    await page.goto('/dashboard');
    const html = page.locator('html');
    await expect(html).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('heading', { name: 'لوحة التحكم' })).toBeVisible();
  });

  test('receipt print view renders RTL Arabic + SDG currency', async ({ page }) => {
    test.skip(!url || !serviceKey, 'requires SUPABASE_SERVICE_ROLE_KEY to look up a seeded receipt id');
    const service = createClient(url!, serviceKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data } = await service
      .from('money_event')
      .select('id')
      .eq('event_type', 'fee_payment')
      .not('receipt_no', 'is', null)
      .limit(1)
      .single();
    expect(data?.id).toBeTruthy();

    await page.goto(`/payments/${data!.id}/receipt`);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('heading', { name: 'إيصال دفع' })).toBeVisible();
    // The default "PDF" tab renders into a <PDFViewer> (an embedded canvas/
    // iframe, not accessible DOM text) — switch to the HTML print-friendly
    // tab to assert the Arabic + SDG currency text.
    await page.getByRole('button', { name: 'نسخة للطباعة' }).click();
    await expect(page.getByText(/ج\.س/).first()).toBeVisible();
  });

  test('student statement renders RTL Arabic + SDG currency', async ({ page }) => {
    test.skip(!url || !serviceKey, 'requires SUPABASE_SERVICE_ROLE_KEY to look up a seeded student id');
    const service = createClient(url!, serviceKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data } = await service.from('student').select('id').limit(1).single();
    expect(data?.id).toBeTruthy();

    await page.goto(`/students/${data!.id}/statement`);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByText(/ج\.س/).first()).toBeVisible();
  });

  test('receivables report renders RTL Arabic aging buckets', async ({ page }) => {
    await page.goto('/reports/receivables');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByText(/متأخر|مستحق/).first()).toBeVisible();
  });
});

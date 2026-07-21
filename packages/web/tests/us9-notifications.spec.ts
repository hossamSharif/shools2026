import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import path from 'node:path';

/**
 * US9 (T130): in-app notification center. A fee payment produces a "payment
 * recorded" notification; low SMS credit produces a low-credit notification;
 * a near-expiry subscription produces an expiring-soon notification. None of
 * these ever trigger an actual SMS/push send — the notification table is
 * purely in-app (Article IV: no external dispatch from a read-model trigger).
 *
 * Auth: seeded accountant_a (School A, ACTIVE, real credit) for the payment
 * test; accountant_e (School E, ACTIVE but zero SMS credit — seeded exactly
 * for this kind of check) for the low-credit and expiring-soon tests, via
 * direct RPC/service-role calls since those triggers aren't reachable from
 * any UI action (low-credit is checked internally by consume_sms_credit;
 * expiring-soon only runs from the cron worker with the service role).
 */

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const SCHOOL_E_ID = 'e0000000-0000-0000-0000-00000000000e';

test.describe('US9 — in-app notification center', () => {
  test.describe('payment recorded (accountant_a)', () => {
    test.use({ storageState: path.resolve(__dirname, '.auth/accountant_a.json') });

    test('recording a payment creates a "payment recorded" notification, no SMS sent', async ({
      page,
    }) => {
      test.skip(!url || !serviceKey, 'requires SUPABASE_SERVICE_ROLE_KEY');
      const service = createClient(url!, serviceKey!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      const { count: smsCountBefore } = await service
        .from('sms_credit_consumption')
        .select('id', { count: 'exact', head: true });

      await test.step('record a fee payment', async () => {
        await page.goto('/payments/new');
        const studentSelect = page.locator('select').first();
        await studentSelect.selectOption({ index: 1 });
        await page.getByText('الحساب', { exact: true }).waitFor();
        const accountSelect = page.locator('select').nth(1);
        await accountSelect.selectOption({ index: 1 });
        await page.getByPlaceholder('0.00').fill('7');
        await page.getByRole('button', { name: 'تسجيل الدفعة' }).click();
        await expect(page.getByText(/تم التسجيل — رقم الإيصال \d+/)).toBeVisible({
          timeout: 10_000,
        });
      });

      await test.step('bell shows an unread payment-recorded notification', async () => {
        await page.goto('/dashboard');
        await page.getByTestId('notification-bell').click();
        const item = page
          .locator('[data-testid="notification-item"][data-type="payment_recorded"]')
          .first();
        await expect(item).toBeVisible({ timeout: 10_000 });
      });

      await test.step('no SMS/push was sent by this flow', async () => {
        const { count: smsCountAfter } = await service
          .from('sms_credit_consumption')
          .select('id', { count: 'exact', head: true });
        expect(smsCountAfter ?? 0).toBe(smsCountBefore ?? 0);
      });
    });
  });

  test.describe('low credit and expiring-soon (accountant_e)', () => {
    test.use({ storageState: path.resolve(__dirname, '.auth/accountant_e.json') });

    test('low SMS credit creates a low-credit notification', async ({ page }) => {
      test.skip(!url || !serviceKey, 'requires SUPABASE_SERVICE_ROLE_KEY');
      const service = createClient(url!, serviceKey!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      // School E is seeded ACTIVE with zero SMS credit specifically for this
      // kind of check (see test_gauntlet_data.sql) — well under any threshold.
      const { error } = await service.rpc('check_low_sms_credit', {
        p_school_id: SCHOOL_E_ID,
        p_threshold: 20,
      });
      expect(error).toBeNull();

      await page.goto('/notifications');
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      const item = page
        .locator('[data-testid="notification-item"][data-type="low_sms_credit"]')
        .first();
      await expect(item).toBeVisible({ timeout: 10_000 });
    });

    test('near-expiry subscription creates an expiring-soon notification', async ({ page }) => {
      test.skip(!url || !serviceKey, 'requires SUPABASE_SERVICE_ROLE_KEY');
      const service = createClient(url!, serviceKey!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      const { data: original } = await service
        .from('subscription')
        .select('period_end')
        .eq('school_id', SCHOOL_E_ID)
        .single<{ period_end: string }>();

      try {
        const inThreeDays = new Date();
        inThreeDays.setDate(inThreeDays.getDate() + 3);
        const nearExpiry = inThreeDays.toISOString().slice(0, 10);
        await service
          .from('subscription')
          .update({ period_end: nearExpiry })
          .eq('school_id', SCHOOL_E_ID);

        const { data, error } = await service.rpc('emit_expiry_notifications', {
          p_within_days: 7,
        });
        expect(error).toBeNull();
        expect(typeof data).toBe('number');

        await page.goto('/notifications');
        const item = page
          .locator('[data-testid="notification-item"][data-type="subscription_expiring"]')
          .first();
        await expect(item).toBeVisible({ timeout: 10_000 });
      } finally {
        // Restore School E's real subscription window so other specs
        // (e.g. US7's insufficient-credit test, which relies on School E
        // being ACTIVE) see consistent state on re-run.
        if (original?.period_end) {
          await service
            .from('subscription')
            .update({ period_end: original.period_end })
            .eq('school_id', SCHOOL_E_ID);
        }
      }
    });

    test('marking a notification read updates its state and the unread count', async ({
      page,
    }) => {
      await page.goto('/dashboard');
      await page.getByTestId('notification-bell').click();
      const item = page.locator('[data-testid="notification-item"]').first();
      await expect(item).toBeVisible({ timeout: 10_000 });

      const unreadBefore = await page
        .locator('[data-testid="notification-item"][data-read="false"]')
        .count();
      test.skip(unreadBefore === 0, 'no unread notification available to mark read');

      const firstUnread = page
        .locator('[data-testid="notification-item"][data-read="false"]')
        .first();
      await firstUnread.click();

      await expect(async () => {
        const unreadAfter = await page
          .locator('[data-testid="notification-item"][data-read="false"]')
          .count();
        expect(unreadAfter).toBe(unreadBefore - 1);
      }).toPass({ timeout: 10_000 });

      // Persistence: reload /notifications (full list, server-rendered).
      await page.goto('/notifications');
      const anyRead = page.locator('[data-testid="notification-item"][data-read="true"]').first();
      await expect(anyRead).toBeVisible();
    });
  });
});

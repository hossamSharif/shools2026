import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import path from 'node:path';

/**
 * US7 (T111): reminder rules configuration + SMS log visibility + manual
 * reminder send. Uses several seeded auth contexts:
 *  - school_admin_a: config the 3 reminder_rule rows for School A (topped up
 *    with SMS credit — see packages/database/seeds/test_gauntlet_data.sql).
 *  - accountant_a: views the School A SMS log (seeded with queued/delivered/
 *    failed rows) and per-student log, and sends a manual reminder.
 *  - accountant_e: School E is seeded ACTIVE but with zero SMS credit, kept
 *    separate from School A precisely so draining credit for the
 *    INSUFFICIENT_CREDIT assertion never touches the "successful send" test.
 */

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

test.describe('US7 — reminder rules + SMS log', () => {
  test.describe('reminder rules (school_admin_a)', () => {
    test.use({ storageState: path.resolve(__dirname, '.auth/school_admin_a.json') });

    test('school_admin can view, toggle, and edit the default reminder rules', async ({ page }) => {
      // Next dev's cold-compile + the RSC data-cache revalidation window can
      // exceed the 30s default under parallel load; give this test more room.
      test.setTimeout(90_000);
      await test.step('navigate to /settings/reminders', async () => {
        await page.goto('/settings/reminders');
        await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
        await expect(page.getByRole('heading', { name: 'قواعد التذكير' })).toBeVisible();
      });

      await test.step('three default rules are seeded (before / on / after)', async () => {
        await expect(page.getByRole('cell', { name: 'قبل الاستحقاق' })).toBeVisible();
        await expect(page.getByRole('cell', { name: 'يوم الاستحقاق' })).toBeVisible();
        await expect(page.getByRole('cell', { name: 'بعد الاستحقاق' })).toBeVisible();
        // All three rows start enabled ("مفعّل").
        const enabledButtons = page.getByRole('button', { name: 'مفعّل' });
        await expect(enabledButtons).toHaveCount(3);
      });

      await test.step('disabling the "before" rule persists after reload', async () => {
        const beforeRow = page.locator('tr', { has: page.getByRole('cell', { name: 'قبل الاستحقاق' }) });
        await beforeRow.getByRole('button', { name: 'مفعّل' }).click();
        await expect(beforeRow.getByRole('button', { name: 'معطّل' })).toBeVisible({ timeout: 10_000 });

        await page.reload();
        const reloadedBeforeRow = page.locator('tr', { has: page.getByRole('cell', { name: 'قبل الاستحقاق' }) });
        await expect(reloadedBeforeRow.getByRole('button', { name: 'معطّل' })).toBeVisible();

        // Re-enable so later tests (and re-runs) see a consistent starting state.
        await reloadedBeforeRow.getByRole('button', { name: 'معطّل' }).click();
        await expect(reloadedBeforeRow.getByRole('button', { name: 'مفعّل' })).toBeVisible({ timeout: 10_000 });
      });

      await test.step('changing the day count on the "before" rule persists after reload', async () => {
        const beforeRow = page.locator('tr', { has: page.getByRole('cell', { name: 'قبل الاستحقاق' }) });
        const daysInput = beforeRow.getByLabel('عدد الأيام');
        await daysInput.fill('5');
        await daysInput.blur();
        await expect(async () => {
          await page.reload();
          const reloadedRow = page.locator('tr', { has: page.getByRole('cell', { name: 'قبل الاستحقاق' }) });
          await expect(reloadedRow.getByLabel('عدد الأيام')).toHaveValue('5');
        }).toPass({ timeout: 45_000, intervals: [2_000] });

        // Restore to the default (3) so the seed's documented default holds for re-runs.
        const beforeRowAgain = page.locator('tr', { has: page.getByRole('cell', { name: 'قبل الاستحقاق' }) });
        const daysInputAgain = beforeRowAgain.getByLabel('عدد الأيام');
        await daysInputAgain.fill('3');
        await daysInputAgain.blur();
        await page.waitForTimeout(500);
      });
    });
  });

  test.describe('SMS log (accountant_a)', () => {
    test.use({ storageState: path.resolve(__dirname, '.auth/accountant_a.json') });

    test('accountant can view the per-school SMS log with statuses', async ({ page }) => {
      await page.goto('/sms');
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      await expect(page.getByRole('heading', { name: 'سجل الرسائل النصية' })).toBeVisible();

      // Seeded rows (test_gauntlet_data.sql) include queued/delivered/failed statuses.
      await expect(page.getByText('قيد الانتظار').first()).toBeVisible();
      await expect(page.getByText('تم التسليم').first()).toBeVisible();
      await expect(page.getByText('فشلت').first()).toBeVisible();
    });

    test("per-student SMS log shows only that student's messages", async ({ page }) => {
      test.skip(!url || !serviceKey, 'requires SUPABASE_SERVICE_ROLE_KEY to look up seeded student ids');
      const service = createClient(url!, serviceKey!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      const studentAId = 'a5000000-0000-0000-0000-000000000001';
      const studentBId = 'a5000000-0000-0000-0000-000000000002';

      const { data: studentARows } = await service
        .from('sms_message_log')
        .select('id')
        .eq('student_id', studentAId);
      const { data: studentBRows } = await service
        .from('sms_message_log')
        .select('id')
        .eq('student_id', studentBId);
      expect((studentARows?.length ?? 0)).toBeGreaterThan(0);
      expect((studentBRows?.length ?? 0)).toBeGreaterThan(0);

      await page.goto(`/students/${studentAId}/sms`);
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      const table = page.locator('table');
      const rows = table.locator('tbody tr');
      await expect(rows).toHaveCount(studentARows!.length);
    });

    test('manual reminder button sends and logs a new SMS', async ({ page }) => {
      const studentId = 'a5000000-0000-0000-0000-000000000003';
      await page.goto(`/students/${studentId}/sms`);
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

      // The table renders a single placeholder <tr> ("لا توجد رسائل بعد لهذا
      // الطالب") when there are zero messages — treat that as a count of 0,
      // not 1, real data rows.
      async function realRowCount(): Promise<number> {
        const emptyState = page.getByText('لا توجد رسائل بعد لهذا الطالب');
        if (await emptyState.isVisible().catch(() => false)) return 0;
        return page.locator('table tbody tr').count();
      }

      const rowsBefore = await realRowCount();

      await page.getByRole('button', { name: 'إرسال تذكير الآن' }).click();
      await expect(page.getByText(/تم الإرسال/)).toBeVisible({ timeout: 15_000 });

      await page.reload();
      const rowsAfter = await realRowCount();
      expect(rowsAfter).toBe(rowsBefore + 1);
    });
  });

  test.describe('manual reminder — insufficient credit (accountant_e)', () => {
    test.use({ storageState: path.resolve(__dirname, '.auth/accountant_e.json') });

    test('manual reminder surfaces INSUFFICIENT_CREDIT as an Arabic error', async ({ page }) => {
      test.skip(!url || !serviceKey, 'requires SUPABASE_SERVICE_ROLE_KEY to look up the seeded School E student');
      const service = createClient(url!, serviceKey!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      const studentId = 'e5000000-0000-0000-0000-000000000001';
      const { count: before } = await service
        .from('sms_message_log')
        .select('id', { count: 'exact', head: true })
        .eq('student_id', studentId);

      await page.goto(`/students/${studentId}/sms`);
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

      await page.getByRole('button', { name: 'إرسال تذكير الآن' }).click();
      await expect(page.getByText('رصيد الرسائل غير كافٍ لإرسال هذا التذكير')).toBeVisible({
        timeout: 15_000,
      });

      const { count: after } = await service
        .from('sms_message_log')
        .select('id', { count: 'exact', head: true })
        .eq('student_id', studentId);
      expect(after ?? 0).toBe(before ?? 0);
    });
  });
});

import path from 'node:path';
import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * US5 (spec 002, T073): the school admin adjusts optional permissions, RTL.
 *
 *   - toggling "معلم: عرض بيانات ولي الأمر" on writes exactly one
 *     `optional_permission_changed` audit row (read with the service client);
 *   - the teacher section offers no finance switch (US5-2);
 *   - switching the viewer's export off makes the viewer's receivables export
 *     return 403 on the next request (US5-3).
 *
 * Runs against the seeded Gauntlet School A (admin.a / viewer.a). Every switch
 * it changes is put back to its default at the end. Needs Supabase env and
 * SUPABASE_SERVICE_ROLE_KEY, plus 0046 applied.
 */

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ready = Boolean(url && anon && serviceKey);

const AUTH = (name: string) => path.resolve(__dirname, '.auth', `${name}.json`);
const ADMIN = { email: 'admin.a@gauntlet.test', password: 'password123' };

test.use({ storageState: AUTH('school_admin_a') });

async function asAdmin(): Promise<{ client: SupabaseClient; schoolId: string }> {
  const client = createClient(url!, anon!, { auth: { persistSession: false } });
  await client.auth.signInWithPassword(ADMIN);
  const { data } = await client.rpc('my_access');
  return { client, schoolId: (data as { school_id: string }).school_id };
}

test.describe('US5 — optional permissions per role', () => {
  test.skip(!ready, 'requires Supabase env + SUPABASE_SERVICE_ROLE_KEY (and 0046 applied)');

  test('toggle, audit, no finance switch for teachers, viewer export revoked', async ({
    page,
    browser,
  }) => {
    const service = createClient(url!, serviceKey!, { auth: { persistSession: false } });
    const { client: admin, schoolId } = await asAdmin();
    const restore = async () => {
      await admin.rpc('set_optional_permission', {
        p_role: 'teacher',
        p_key: 'students.guardian_contact',
        p_enabled: false,
      });
      await admin.rpc('set_optional_permission', {
        p_role: 'viewer',
        p_key: 'finance.export',
        p_enabled: true,
      });
    };
    await restore();
    const auditCount = async () =>
      (
        await service
          .from('access_audit_entry')
          .select('id', { count: 'exact', head: true })
          .eq('school_id', schoolId)
          .eq('action', 'optional_permission_changed')
      ).count ?? 0;

    try {
      await page.goto('/users/permissions');
      await expect(page.locator('[dir="rtl"]').first()).toBeVisible();

      // 1. Teacher guardian contact on → exactly one audit row.
      const before = await auditCount();
      const sw = page.getByRole('switch', { name: 'معلم: عرض بيانات ولي الأمر' });
      await expect(sw).toHaveAttribute('aria-checked', 'false');
      await sw.click();
      await expect(sw).toHaveAttribute('aria-checked', 'true');
      await expect.poll(auditCount).toBe(before + 1);

      // 2. The teacher section lists no finance switch, and no switch outside the catalogue.
      const teacher = page.getByTestId('role-section-teacher');
      await expect(teacher.getByRole('switch')).toHaveCount(2);
      await expect(teacher.getByRole('switch', { name: /المالية|الرسوم|المدفوعات/ })).toHaveCount(
        0,
      );

      // 3. Viewer export: 200 before, 403 on the next request after switching it off.
      const viewerCtx = await browser.newContext({ storageState: AUTH('viewer_a') });
      const exportUrl = '/reports/receivables/export';
      expect((await viewerCtx.request.get(exportUrl)).status()).toBe(200);
      const exp = page.getByRole('switch', { name: 'مطّلع: تصدير التقارير المالية' });
      await expect(exp).toHaveAttribute('aria-checked', 'true');
      await exp.click();
      await expect(exp).toHaveAttribute('aria-checked', 'false');
      expect((await viewerCtx.request.get(exportUrl)).status()).toBe(403);
      await viewerCtx.close();
    } finally {
      await restore();
    }
  });
});

import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';

/**
 * US7 (spec 002, T080, FR-029): portal-only identities (guardian, student)
 * cannot use the staff app yet. They sign in at /login, stay on /login with
 * "بوابة أولياء الأمور والطلاب غير متاحة بعد", and leave no session behind.
 *
 * Uses the guardianX and studentY users of the isolated access fixture
 * (E2E_ACCESS_FIXTURE=1, see global-setup.ts).
 */

const AUTH_DIR = path.resolve(__dirname, '.auth');
const ready = Boolean(
  (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL) &&
  process.env.SUPABASE_SERVICE_ROLE_KEY &&
  process.env.E2E_ACCESS_FIXTURE === '1',
);
const PASSWORD = 'Test-Passw0rd!';
const MESSAGE = 'بوابة أولياء الأمور والطلاب غير متاحة بعد';

test.describe('US7 — portal users are refused by the staff login', () => {
  test.skip(!ready, 'requires Supabase env + SUPABASE_SERVICE_ROLE_KEY + E2E_ACCESS_FIXTURE=1');
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const who of ['guardianX', 'studentY'] as const) {
    test(`${who} stays on /login with the portal message, signed out`, async ({
      page,
      context,
    }) => {
      const fx = JSON.parse(
        fs.readFileSync(path.join(AUTH_DIR, 'access-fixture.json'), 'utf8'),
      ) as {
        users: Record<string, { email: string }>;
      };

      await page.goto('/login');
      await expect(page.locator('[dir="rtl"]').first()).toBeVisible();
      await page.getByLabel('البريد الإلكتروني').fill(fx.users[who]!.email);
      await page.getByLabel('كلمة المرور').fill(PASSWORD);
      await page.getByRole('button', { name: 'تسجيل الدخول' }).click();

      await expect(page.getByRole('alert').filter({ hasText: MESSAGE })).toBeVisible();
      await expect(page).toHaveURL(/\/login/);

      // The session is cleared: no usable auth cookie, and a protected page sends back to /login.
      await expect
        .poll(
          async () =>
            (await context.cookies()).filter((c) => /^sb-.*-auth-token/.test(c.name) && c.value)
              .length,
        )
        .toBe(0);
      await page.goto('/home');
      await expect(page).toHaveURL(/\/login/);
    });
  }
});

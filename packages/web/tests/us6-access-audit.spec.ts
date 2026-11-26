import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

/**
 * US6 (spec 002, T075): the access audit screen, RTL.
 *
 *   - after the admin adds the principal role to a user, /users/audit shows
 *     "إضافة دور: المدير الأكاديمي" with an Africa/Khartoum timestamp (US6-1);
 *   - the action filter narrows the rows;
 *   - the CSV export downloads with a UTF-8 BOM and the Arabic headers
 *     التاريخ, المنفّذ, المستخدم المستهدف, الإجراء, قبل, بعد (FR-033).
 *
 * Uses the isolated access fixture (E2E_ACCESS_FIXTURE=1, see global-setup.ts),
 * which is removed at teardown. Needs Supabase env, SUPABASE_SERVICE_ROLE_KEY
 * and 0047 applied.
 */

const AUTH_DIR = path.resolve(__dirname, '.auth');
const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const ready = Boolean(
  url && anon && process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.E2E_ACCESS_FIXTURE === '1',
);

interface Fixture {
  users: Record<string, { userId: string; email: string }>;
}

/** Today's date as the app formats it in Africa/Khartoum (yyyy/MM/dd). */
const khartoumToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Khartoum' })
    .format(new Date())
    .replace(/-/g, '/');

test.describe('US6 — access audit', () => {
  test.skip(
    !ready,
    'requires Supabase env + SUPABASE_SERVICE_ROLE_KEY + E2E_ACCESS_FIXTURE=1 (and 0047 applied)',
  );
  test.use({ storageState: path.join(AUTH_DIR, 'access_adminA.json') });

  test('a role change is listed in Khartoum time, filters narrow, CSV exports', async ({
    page,
  }) => {
    const fx = JSON.parse(
      fs.readFileSync(path.join(AUTH_DIR, 'access-fixture.json'), 'utf8'),
    ) as Fixture;
    const admin = createClient(url!, anon!, { auth: { persistSession: false } });
    await admin.auth.signInWithPassword({
      email: fx.users.adminA!.email,
      password: 'Test-Passw0rd!',
    });
    const { error } = await admin.rpc('set_user_roles', {
      p_user_id: fx.users.viewer!.userId,
      p_roles: ['viewer', 'principal'],
    });
    expect(error).toBeNull();

    // 1. The entry, with today's Khartoum date.
    await page.goto('/users/audit');
    await expect(page.locator('[dir="rtl"]').first()).toBeVisible();
    const table = page.getByTestId('access-audit-table');
    const row = table.getByRole('row', { name: /إضافة دور: المدير الأكاديمي/ }).first();
    await expect(row).toBeVisible();
    await expect(row).toContainText(khartoumToday());
    await expect(row).toContainText('الأدوار: مطّلع ← مطّلع، المدير الأكاديمي');

    // 2. The action filter narrows the rows to that action only.
    await page.getByTestId('filter-action').selectOption('role_removed');
    await expect(page).toHaveURL(/action=role_removed/);
    await expect(table.getByRole('row', { name: /إضافة دور/ })).toHaveCount(0);
    await page.getByTestId('filter-action').selectOption('role_added');
    await expect(page).toHaveURL(/action=role_added/);
    const bodyRows = table.locator('tbody tr');
    await expect(bodyRows.first()).toContainText('إضافة دور');
    for (const text of await bodyRows.allInnerTexts()) expect(text).toContain('إضافة دور');

    // 3. CSV: BOM + Arabic headers, and the filtered row.
    const res = await page.request.get('/users/audit/export?action=role_added');
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('text/csv');
    const body = await res.body();
    expect([...body.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = body.toString('utf8').replace(/^﻿/, '');
    const [header, ...lines] = text.split('\n');
    expect(header).toBe('التاريخ,المنفّذ,المستخدم المستهدف,الإجراء,قبل,بعد');
    expect(lines.some((l) => l.includes('إضافة دور: المدير الأكاديمي'))).toBe(true);
    expect(lines.every((l) => l.includes('إضافة دور'))).toBe(true);
  });
});

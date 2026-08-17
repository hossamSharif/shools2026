import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';

/**
 * Students section enhancement E2E: smart search, class/financial filters,
 * modal create/edit, the guarded delete, and the student profile screen.
 *
 * Auth: seeded school-admin-A (School A, ACTIVE) — delete is school-admin-only,
 * and School A carries the Gauntlet seed: 12 students "طالب اختبار 1..12" with
 * guardians "ولي أمر N" and phones "+2499000000NN", enrolled in a p1 section
 * with real installments, payments and discounts behind them.
 */
test.use({ storageState: path.resolve(__dirname, '.auth/school_admin_a.json') });

const SEEDED_STUDENT_ID = 'a5000000-0000-0000-0000-000000000001';

/** Row count of the desktop students table (excludes the header row). */
async function rowCount(page: Page): Promise<number> {
  return page.locator('table tbody tr').count();
}

/**
 * Wait for the debounced search + server round-trip to land in the URL.
 * Compares the decoded `q` param rather than matching an encoded string:
 * URLSearchParams serialises a space as `+`, not `%20`, so a regex built from
 * encodeURIComponent never matches a multi-word term.
 */
async function searchFor(page: Page, term: string) {
  await page.getByTestId('filter-search').fill(term);
  await page.waitForURL((u) => u.searchParams.get('q') === term, { timeout: 10_000 });
  await page.waitForLoadState('networkidle');
}

test.describe('Students directory — search and filters', () => {
  test('smart search matches name, guardian, phone, and out-of-order tokens', async ({ page }) => {
    test.setTimeout(90_000); // dev-mode recompiles across many navigations

    await page.goto('/students');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('heading', { name: 'الطلاب' })).toBeVisible();

    const unfiltered = await rowCount(page);
    expect(unfiltered).toBeGreaterThan(1);

    await test.step('partial student name', async () => {
      await searchFor(page, 'طالب اختبار 1');
      const rows = await rowCount(page);
      expect(rows).toBeGreaterThan(0);
      expect(rows).toBeLessThan(unfiltered);
      await expect(page.locator('table tbody tr').first()).toContainText('طالب اختبار');
    });

    await test.step('guardian name', async () => {
      await searchFor(page, 'ولي أمر 3');
      await expect(page.locator('table tbody tr').first()).toContainText('طالب اختبار 3');
    });

    await test.step('phone entered without the +249 prefix', async () => {
      // Seeded as "+249900000002"; the operator types the local trailing form.
      await searchFor(page, '900000002');
      await expect(page.locator('table tbody tr').first()).toContainText('طالب اختبار 2');
    });

    await test.step('tokens out of order still match', async () => {
      await searchFor(page, '4 اختبار');
      await expect(page.locator('table tbody tr').first()).toContainText('طالب اختبار 4');
    });

    await test.step('reset clears every filter', async () => {
      await page.getByTestId('filter-reset').click();
      await page.waitForURL((u) => !u.search, { timeout: 10_000 });
      expect(await rowCount(page)).toBe(unfiltered);
    });
  });

  test('financial-status filter narrows the list and the KPI strip follows it', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.goto('/students');

    const allKpis = page.getByTestId('kpi-card');
    await expect(allKpis.first()).toBeVisible();

    await page.getByTestId('filter-fin').selectOption('overdue');
    await page.waitForURL(/fin=overdue/, { timeout: 10_000 });
    await page.waitForLoadState('networkidle');

    // Every remaining row must carry the overdue badge.
    const badges = page.locator('table tbody tr [data-testid="fin-status"]');
    const n = await badges.count();
    for (let i = 0; i < n; i++) {
      await expect(badges.nth(i)).toHaveAttribute('data-status', 'overdue');
    }

    // The "إجمالي الطلاب" card describes the filtered set, not the whole roster.
    // Deliberately NOT asserting the count changed: whether it does depends on
    // how much of the seeded roster happens to be overdue today, which drifts
    // as other specs post money. Equality with the visible row count is the
    // claim that actually matters and holds regardless.
    const totalAfter = await allKpis.first().getByTestId('kpi-value').textContent();
    expect(String(totalAfter)).toBe(String(n));
  });

  test('grade filter and CSV export reflect the same filtered view', async ({ page }) => {
    await page.goto('/students');
    await page.getByTestId('filter-gradeId').selectOption({ index: 1 });
    await page.waitForURL(/gradeId=/, { timeout: 10_000 });

    const exportHref = await page.getByTestId('export-students').getAttribute('href');
    expect(exportHref).toContain('gradeId=');

    const res = await page.request.get(exportHref!);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('text/csv');
    expect(await res.text()).toContain('الرصيد المستحق');
  });
});

test.describe('Students directory — create, edit, delete', () => {
  test('create in a modal, edit via the row menu, then delete the clean record', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const name = `طالب مؤقت ${Date.now()}`;
    const phone = '+249911111111';

    await page.goto('/students');

    await test.step('create via the header modal', async () => {
      await page.getByTestId('new-student').click();
      const dialog = page.getByTestId('student-form-dialog');
      await expect(dialog).toBeVisible();
      await dialog.getByLabel('اسم الطالب').fill(name);
      await dialog.getByLabel('اسم ولي الأمر').fill('ولي أمر مؤقت');
      await dialog.getByLabel('هاتف ولي الأمر').fill(phone);
      await dialog.getByRole('button', { name: 'إضافة الطالب' }).click();
      await expect(dialog).toBeHidden({ timeout: 15_000 });
      await expect(page.getByRole('row', { name: new RegExp(name) })).toBeVisible({
        timeout: 15_000,
      });
    });

    await test.step('edit the guardian phone from the row menu', async () => {
      const row = page.getByRole('row', { name: new RegExp(name) });
      await row.getByTestId('row-actions-trigger').click();
      await page.getByRole('menuitem', { name: 'تعديل' }).click();
      const dialog = page.getByTestId('student-form-dialog');
      await expect(dialog).toBeVisible();
      await dialog.getByLabel('هاتف ولي الأمر').fill('+249922222222');
      await dialog.getByRole('button', { name: 'حفظ التعديلات' }).click();
      await expect(dialog).toBeHidden({ timeout: 15_000 });
      await expect(page.getByRole('row', { name: new RegExp(name) })).toContainText(
        '+249922222222',
        { timeout: 15_000 },
      );
    });

    await test.step('delete succeeds — the record has no financial history', async () => {
      const row = page.getByRole('row', { name: new RegExp(name) });
      await row.getByTestId('row-actions-trigger').click();
      await page.getByRole('menuitem', { name: 'حذف' }).click();
      const confirm = page.getByTestId('confirm-dialog');
      await expect(confirm).toBeVisible();
      // Type-to-confirm: the button stays disabled until the name matches.
      await expect(confirm.getByTestId('confirm-submit')).toBeDisabled();
      await confirm.getByTestId('confirm-input').fill(name);
      await confirm.getByTestId('confirm-submit').click();
      await expect(confirm).toBeHidden({ timeout: 15_000 });
      await expect(page.getByRole('row', { name: new RegExp(name) })).toHaveCount(0, {
        timeout: 15_000,
      });
    });
  });

  test('row menu opens fully inside the viewport, labels not clipped', async ({ page }) => {
    // Regression: the menu used to be an absolutely-positioned child of the
    // table, which `DataTable`'s `overflow-x-auto` wrapper clipped. The actions
    // column is last — hard against the left edge in RTL — so the menu was
    // sliced in half and its labels rendered as fragments ("تسجيا").
    await page.goto('/students');
    const row = page.locator('table tbody tr').first();
    await row.getByTestId('row-actions-trigger').click();

    const menu = page.getByTestId('row-actions-menu');
    await expect(menu).toBeVisible();

    const box = await menu.boundingBox();
    const viewport = page.viewportSize();
    expect(box).not.toBeNull();
    expect(viewport).not.toBeNull();

    // Fully within the viewport on both axes — the actual bug.
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height);

    // A long label renders in full rather than as a clipped fragment.
    const enrol = menu.getByRole('menuitem', { name: 'تسجيل في صف' });
    await expect(enrol).toBeVisible();
    const enrolBox = await enrol.boundingBox();
    expect(enrolBox!.x).toBeGreaterThanOrEqual(0);
    expect(enrolBox!.x + enrolBox!.width).toBeLessThanOrEqual(viewport!.width);

    // Escape closes and returns focus to the trigger.
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
  });

  test('delete is blocked for a student who has financial history', async ({ page }) => {
    await page.goto('/students');
    // Seeded student 1 carries installments, payments and discounts.
    const row = page.getByRole('row', { name: /طالب اختبار 1(?!\d)/ }).first();
    await row.getByTestId('row-actions-trigger').click();

    const del = page.getByRole('menuitem', { name: 'حذف' });
    await expect(del).toBeDisabled();
    await expect(del).toHaveAttribute('title', /الأرشفة/);
  });
});

test.describe('Student profile', () => {
  test('shows info, financial KPIs, next due, installments, payments and ledger', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.goto(`/students/${SEEDED_STUDENT_ID}`);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

    await expect(page.getByRole('heading', { name: /طالب اختبار 1/ })).toBeVisible();
    await expect(page.getByText('بيانات الطالب')).toBeVisible();
    await expect(page.getByText('ولي أمر 1', { exact: true })).toBeVisible();

    // Financial KPI strip. Scoped to the strip: "الرصيد المستحق" also appears in
    // the un-allocated-discount reconciliation line under the installment table.
    const kpis = page.getByTestId('section-kpis');
    await expect(kpis.getByText('إجمالي الرسوم')).toBeVisible();
    await expect(kpis.getByText('الرصيد المستحق')).toBeVisible();
    await expect(kpis.getByText('نسبة السداد')).toBeVisible();

    await expect(page.getByTestId('next-due')).toBeVisible();

    await expect(page.getByRole('heading', { name: 'جدول الأقساط' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'سجل المدفوعات' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'كشف الحساب التفصيلي' })).toBeVisible();

    // At least one installment row with a status badge.
    await expect(page.locator('[data-testid="fin-status"]').first()).toBeVisible();
  });

  test('exports the enriched statement PDF', async ({ page }) => {
    test.setTimeout(60_000); // server-side @react-pdf render is slow in dev mode
    await page.goto(`/students/${SEEDED_STUDENT_ID}`);
    const href = await page.getByTestId('statement-pdf').getAttribute('href');
    expect(href).toBe(`/students/${SEEDED_STUDENT_ID}/statement/pdf`);

    const res = await page.request.get(href!);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('application/pdf');
    expect((await res.body()).byteLength).toBeGreaterThan(1000);
  });
});

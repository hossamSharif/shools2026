import { test, expect } from '@playwright/test';
import path from 'node:path';

/**
 * US2 E2E (T042): the school-admin builds the academic spine — academic year,
 * a section under a fixed grade, an account, and a fee structure with an
 * installment schedule — then adds and enrolls a student, and the student's
 * installments generate from the fee structure (FR-018).
 *
 * Auth: seeded school-admin-B's storageState (see tests/global-setup.ts).
 * School B starts with an empty spine (no years/sections/accounts/fee
 * structures/students), so this genuinely exercises creation end to end
 * rather than relying on pre-seeded Gauntlet fixtures.
 */
test.use({ storageState: path.resolve(__dirname, '.auth/school_admin_b.json') });

test.describe('US2 — academic spine and enrollment', () => {
  test('set up spine, enroll a student, and see generated installments', async ({ page }) => {
    test.setTimeout(60_000); // dev-mode Fast Refresh recompiles across many steps run long
    const yearLabel = `سنة اختبار ${Date.now()}`;
    const accountName = `حساب اختبار ${Date.now()}`;
    const studentName = `طالب اختبار ${Date.now()}`;
    // Section names are unique per grade — a fixed "أ" collides across repeated
    // test runs (section_name_unique), so generate a fresh one each run.
    const sectionName = `أ${Date.now()}`;

    await test.step('create the current academic year', async () => {
      await page.goto('/settings/years');
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      await page.getByLabel('اسم السنة الدراسية').fill(yearLabel);
      await page.getByLabel('تعيين كسنة حالية').check();
      await page.getByRole('button', { name: 'إضافة' }).click();
      await expect(page.getByRole('row', { name: new RegExp(yearLabel) })).toBeVisible();
    });

    await test.step('create a section under the first fixed grade', async () => {
      await page.goto('/settings/grades');
      await page.getByPlaceholder('اسم الشعبة (مثال: أ)').first().fill(sectionName);
      await page.getByRole('button', { name: 'إضافة شعبة' }).first().click();
      await expect(page.getByText(sectionName, { exact: true }).first()).toBeVisible();
    });

    await test.step('create a cash account with an opening balance', async () => {
      await page.goto('/settings/accounts');
      await page.getByLabel('اسم الحساب').fill(accountName);
      await page.getByLabel('الرصيد الافتتاحي').fill('1000');
      await page.getByRole('button', { name: 'إضافة الحساب' }).click();
      await expect(page.getByRole('row', { name: new RegExp(accountName) })).toBeVisible();
    });

    await test.step('define a fee structure with a two-installment schedule', async () => {
      await page.goto('/settings/fees');
      const gradeSelect = page.locator('select').first();
      await gradeSelect.selectOption({ index: 1 }); // first real grade option
      const yearSelect = page.locator('select').nth(1);
      await yearSelect.selectOption({ label: yearLabel });

      await page.getByPlaceholder('اسم العنصر (مثال: رسوم التسجيل)').fill('رسوم دراسية');
      await page.getByPlaceholder('المبلغ').first().fill('500');

      const scheduleSection = page.locator('div').filter({ hasText: 'جدول الأقساط' }).last();
      await scheduleSection.locator('input[type="date"]').first().fill('2026-09-01');
      await scheduleSection.locator('input[placeholder="المبلغ"]').first().fill('300');
      await scheduleSection.getByRole('button', { name: 'إضافة قسط' }).click();
      const dateInputs = scheduleSection.locator('input[type="date"]');
      await dateInputs.nth(1).fill('2026-12-01');
      const amountInputs = scheduleSection.locator('input[placeholder="المبلغ"]');
      await amountInputs.nth(1).fill('200');

      await page.getByRole('button', { name: 'حفظ هيكل الرسوم' }).click();
      await expect(page.getByText('تم حفظ هيكل الرسوم')).toBeVisible({ timeout: 10_000 });
    });

    let studentId = '';
    await test.step('add a student', async () => {
      await page.goto('/students');
      await page.getByLabel('اسم الطالب').fill(studentName);
      await page.getByRole('button', { name: 'إضافة الطالب' }).click();
      const row = page.getByRole('row', { name: new RegExp(studentName) });
      await expect(row).toBeVisible({ timeout: 10_000 });
      const href = await row.getByRole('link', { name: studentName }).getAttribute('href');
      studentId = href!.split('/').pop()!;
    });

    await test.step('enroll the student and verify generated installments', async () => {
      await page.goto(`/students/${studentId}/enroll`);
      const gradeSelect = page.locator('select').first();
      await gradeSelect.selectOption({ index: 1 });
      const sectionSelect = page.locator('select').nth(1);
      // The section select is disabled until the grade state commits, and its
      // options repopulate on that same re-render — wait for both before acting.
      await expect(sectionSelect).toBeEnabled();
      await expect(sectionSelect.getByRole('option', { name: sectionName })).toBeAttached();
      await sectionSelect.selectOption({ label: sectionName });
      await expect(sectionSelect).toHaveValue(/.+/);
      const yearSelect = page.locator('select').nth(2);
      await yearSelect.selectOption({ label: yearLabel });
      await expect(page.getByRole('button', { name: 'تسجيل' })).toBeEnabled();
      await page.getByRole('button', { name: 'تسجيل' }).click();
      await expect(page.getByText('تم تسجيل الطالب')).toBeVisible({ timeout: 10_000 });

      // generate_installments ran: the student's statement shows the total
      // owed matching the fee structure's schedule sum (300 + 200 = 500).
      await page.goto(`/students/${studentId}/statement`);
      await expect(page.getByText('إجمالي المستحق')).toBeVisible();
      await expect(page.getByText(/٥٠٠/).first()).toBeVisible();
    });
  });
});

import { test, expect } from '@playwright/test';

/**
 * US2 E2E SKELETON (T042): the school-admin sets up the academic spine (academic
 * year, sections, accounts, fee structure + installment schedule) then enrolls a
 * student — and the student's installments appear, generated from the structure.
 *
 * Auth: needs a seeded school-admin session (storageState) for an ACTIVE school.
 * Skipped until the seeded-auth Gauntlet environment is wired (T136); mirrors the
 * US1 spec structure. Steps are TODO placeholders describing the intended flow.
 */
test.describe('US2 — academic spine and enrollment', () => {
  test.skip('set up spine, enroll a student, and see generated installments', async ({ page }) => {
    // TODO(T136): sign in as a seeded school-admin (storageState) for an active school.

    await test.step('create the current academic year', async () => {
      // TODO: goto /academic-years/new, fill label, mark current, submit.
      await page.goto('/academic-years/new');
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl'); // RTL (Article IX)
    });

    await test.step('create a section under a fixed grade', async () => {
      // TODO: goto /sections/new, pick grade, name the section, submit.
    });

    await test.step('create a cash/bank account with an opening balance', async () => {
      // TODO: goto /accounts/new, choose type, set opening_balance, submit.
    });

    await test.step('define a fee structure with an installment schedule', async () => {
      // TODO: goto /fee-structures/new for (grade, year), add fee items +
      // schedule rows (sequence, due date, amount), submit.
    });

    await test.step('add a student', async () => {
      // TODO: goto /students/new, fill name/guardian, submit.
    });

    await test.step('enroll the student and verify generated installments', async () => {
      // TODO: goto /enrollments/new, pick student/grade/section/year, submit.
      // TODO: assert the student statement lists installments matching the
      // schedule (count, amounts, due dates) — proves generate_installments ran.
    });
  });
});

import { test, expect } from '@playwright/test';

/**
 * US5 E2E SKELETON (T093): a bursar opens a student statement for a student
 * with charges, a discount, and partial payments — the running balance and
 * total owed must be correct, the page renders RTL Arabic, and the statement
 * exports to PDF.
 *
 * Auth: needs a seeded accountant/viewer session (storageState) for an ACTIVE
 * school with a prepared student ledger. Skipped until the seeded-auth
 * Gauntlet environment is wired (T136); mirrors the US3/US4 spec structure.
 */
test.describe('US5 — student statement', () => {
  test.skip('renders RTL, running balance + total owed correct, exports PDF', async ({ page }) => {
    // TODO(T136): sign in as a seeded accountant (storageState) for an active
    // school with a student that has: installment charges, a discount, and one
    // or more partial fee payments.

    await test.step('open the statement page', async () => {
      // TODO: goto /students/{studentId}/statement
      await page.goto('/students/00000000-0000-0000-0000-000000000000/statement');
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl'); // RTL (Article IX)
    });

    await test.step('running balance decreases with each payment/discount row', async () => {
      // TODO: read the "الرصيد الجاري" column top-to-bottom and assert it is
      // monotonically consistent with charge − credit per row.
    });

    await test.step('total owed matches the derived student_balance RPC', async () => {
      // TODO: compare the "إجمالي المستحق" tile to the last row's running_balance
      // and to a direct student_balance RPC call for the same student.
    });

    await test.step('exports the statement as a PDF', async () => {
      // TODO: click "تصدير PDF", assert the new tab / download resolves with
      // Content-Type: application/pdf.
      await page.goto('/students/00000000-0000-0000-0000-000000000000/statement/pdf');
    });
  });
});

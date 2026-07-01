import { test, expect } from '@playwright/test';

/**
 * US3 E2E SKELETON (T061): the accountant records a fee payment against a student's
 * outstanding installments; a gapless receipt number is issued, the account balance
 * rises, the student's balance falls, and overpayment is blocked.
 *
 * Auth: needs a seeded accountant session (storageState) for an ACTIVE school with a
 * student that already has installments. Skipped until the seeded-auth Gauntlet
 * environment is wired (T136); mirrors the US1 spec structure.
 */
test.describe('US3 — record a fee payment', () => {
  test.skip('take a partial payment, see receipt + balances, then block overpayment', async ({
    page,
  }) => {
    // TODO(T136): sign in as a seeded accountant (storageState) for an active school.

    await test.step('open the student payment screen', async () => {
      // TODO: goto /students/:id/pay (or search → select student).
      await page.goto('/students');
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl'); // RTL (Article IX)
    });

    await test.step('record a partial payment against oldest-first installments', async () => {
      // TODO: enter amount, choose account, submit apply_fee_payment.
    });

    await test.step('verify a gapless receipt number is shown', async () => {
      // TODO: assert a receipt number is displayed (per-school gapless, SC-003).
    });

    await test.step('verify account balance up and student balance down', async () => {
      // TODO: assert account_balance = opening + payment; student balance dropped
      // by the payment; installment running balance reconciled (never negative).
    });

    await test.step('attempt overpayment and see it blocked', async () => {
      // TODO: enter an amount beyond total outstanding, submit, assert a
      // user-facing "overpayment blocked" error (OVERPAYMENT_BLOCKED).
    });
  });
});

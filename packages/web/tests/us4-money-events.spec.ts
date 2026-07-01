import { test, expect } from '@playwright/test';

/**
 * US4 E2E SKELETON (T075): the accountant records the non-payment money events —
 * expense, transfer, refund, adjustment (write-off), discount — and reverses an
 * entry. Balances stay derived; reversals leave both rows visible.
 *
 * Auth: needs a seeded accountant session (storageState) for an ACTIVE school.
 * Skipped until the seeded-auth Gauntlet environment is wired (T136); mirrors the
 * US1 spec structure.
 */
test.describe('US4 — money events and reversal', () => {
  test.skip('record expense/transfer/refund/adjustment/discount, then reverse', async ({
    page,
  }) => {
    // TODO(T136): sign in as a seeded accountant (storageState) for an active school.

    await test.step('record an expense and see the account balance drop', async () => {
      // TODO: goto /expenses/new, pick account/category/amount, submit.
      await page.goto('/expenses/new');
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl'); // RTL (Article IX)
    });

    await test.step('record a transfer between two accounts (sum-neutral)', async () => {
      // TODO: goto /transfers/new, pick from/to/amount; assert from down, to up.
    });

    await test.step('record a refund (account down, student owed up)', async () => {
      // TODO: goto /refunds/new, pick student/account/amount, submit.
    });

    await test.step('record an adjustment / write-off (student owed down)', async () => {
      // TODO: goto /adjustments/new, pick student/amount/reason, submit.
    });

    await test.step('apply a discount (no cash movement, student balance down)', async () => {
      // TODO: goto /discounts/new, choose percentage/fixed, submit.
    });

    await test.step('reverse an entry and confirm both rows remain visible', async () => {
      // TODO: open a posted event, reverse it with a reason; assert the original
      // AND the reversal both appear on the ledger, and the balance is restored.
    });
  });
});

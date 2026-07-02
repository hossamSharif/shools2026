import { test, expect } from '@playwright/test';

/**
 * US6 E2E SKELETON (T102): with accounts/charges/payments/expenses present,
 * the dashboard shows correct per-account balances + combined total, and the
 * derived KPIs (collected, outstanding, collection rate, net cash flow,
 * overdue count, SMS credit) match event-sum derived figures.
 *
 * Auth: needs a seeded school_admin session (storageState) for an ACTIVE
 * school with a prepared money-event history. Skipped until the seeded-auth
 * Gauntlet environment is wired (T136).
 */
test.describe('US6 — admin dashboard', () => {
  test.skip('KPIs match event-sum derived figures; account balances + combined total correct', async ({
    page,
  }) => {
    // TODO(T136): sign in as a seeded school_admin (storageState) for an active
    // school with accounts, fee payments, expenses, and an overdue student.

    await test.step('open the dashboard', async () => {
      await page.goto('/dashboard');
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl'); // RTL (Article IX)
    });

    await test.step('per-account balances and the combined total are correct', async () => {
      // TODO: read each account tile, sum them, compare to the "إجمالي الأرصدة"
      // tile and to direct account_balance RPC calls.
    });

    await test.step('collected/outstanding/collection-rate/net-cash-flow/overdue KPIs are correct', async () => {
      // TODO: compare each tile to a direct dashboard_kpis RPC call for the
      // same school (same-request derivation, Article II).
    });

    await test.step('SMS credit remaining tile and the subscription countdown banner render', async () => {
      // TODO: assert the credit tile shows the derived sms_credit_balance and
      // the pinned countdown banner shows the correct lifecycle state.
    });

    await test.step('dashboard loads within the 3s performance budget', async () => {
      // TODO: measure navigation timing and assert <= 3000ms (constitution
      // Performance Goals).
    });
  });
});

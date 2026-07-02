import { test, expect } from '@playwright/test';

/**
 * US8 E2E SKELETON (T126, G3.4): subscription lifecycle enforcement in the UI.
 * grace ⇒ read-only (mutate nav/actions hidden, view/export still work); locked
 * ⇒ same, plus a pinned banner; every attempt to reach a mutate route while
 * gated is blocked 100% (either hidden from nav, or the server RPC rejects
 * with WRITES_GATED if navigated to directly).
 *
 * Auth: needs seeded accountant sessions (storageState) for schools pinned to
 * grace/locked lifecycle states respectively. Skipped until the seeded-auth
 * Gauntlet environment is wired (T136); mirrors the US1/US4 spec structure.
 */
test.describe('US8 — subscription lifecycle enforcement', () => {
  test.skip('grace: read-only UI, banner shown, mutate nav hidden', async ({ page }) => {
    // TODO(T136): sign in as a seeded accountant for a school in 'grace'.
    await page.goto('/dashboard');

    await test.step('pinned banner reflects grace state', async () => {
      // TODO: assert banner [data-lifecycle-state="grace"] is visible with
      // remaining-days countdown.
    });

    await test.step('mutate nav items are hidden', async () => {
      // TODO: assert /payments/new, /expenses/new are not in the nav list.
    });

    await test.step('read/export routes still work', async () => {
      // TODO: goto /reports/receivables, /students; assert 200 + data renders.
    });

    await test.step('direct navigation to a mutate route + submit is rejected server-side', async () => {
      // TODO: goto /payments/new directly, submit; assert WRITES_GATED surfaces
      // as a user-facing error (not a silent success).
    });
  });

  test.skip('locked: view/export-only, 100% of new money events blocked', async ({ page }) => {
    // TODO(T136): sign in as a seeded accountant for a school in 'locked'.
    await page.goto('/dashboard');

    await test.step('pinned banner reflects locked state', async () => {
      // TODO: assert banner [data-lifecycle-state="locked"] is visible.
    });

    await test.step('all mutate surfaces are blocked', async () => {
      // TODO: for each of payments/expenses/transfers/refunds/adjustments/new,
      // assert the nav entry is absent AND the RPC rejects WRITES_GATED if
      // reached directly — 100% coverage, no exceptions.
    });

    await test.step('exports still succeed', async () => {
      // TODO: trigger a CSV/PDF export; assert it completes.
    });
  });
});

import { test, expect } from '@playwright/test';

/**
 * US9 E2E SKELETON (T130): in-app notification center. A fee payment produces
 * a "payment recorded" notification; low SMS credit produces a low-credit
 * notification; a near-expiry subscription produces an expiring-soon
 * notification. None of these ever trigger an actual SMS/push send — the
 * notification table is purely in-app (Article IV: no external dispatch from
 * a read-model trigger).
 *
 * Auth: needs a seeded accountant session (storageState) for an ACTIVE school.
 * Skipped until the seeded-auth Gauntlet environment is wired (T136); mirrors
 * the US1/US4 spec structure.
 */
test.describe('US9 — in-app notification center', () => {
  test.skip('recording a payment creates a "payment recorded" notification', async ({ page }) => {
    // TODO(T136): sign in as a seeded accountant for an active school.
    await test.step('record a fee payment', async () => {
      // TODO: goto /payments/new, submit a valid payment.
    });

    await test.step('bell shows an unread payment-recorded notification', async () => {
      // TODO: click [data-testid="notification-bell"]; assert an item with
      // data-type="payment_recorded" and data-read="false" appears.
    });

    await test.step('no SMS/push was sent', async () => {
      // TODO: assert no sms_credit_consumption row was created by this flow
      // (payment-recorded is in-app only).
    });
  });

  test.skip('low SMS credit creates a low-credit notification', async ({ page }) => {
    // TODO: drive SMS credit below threshold (via consume_sms_credit / seed),
    // then assert a low_sms_credit notification appears for admin/accountant
    // users, at most once per day.
  });

  test.skip('near-expiry subscription creates an expiring-soon notification', async ({ page }) => {
    // TODO: seed a subscription with period_end within the cron's lookahead
    // window, run/trigger emit_expiry_notifications, then assert a
    // subscription_expiring notification appears with days_remaining.
  });

  test.skip('marking a notification read updates its state and the unread count', async ({
    page,
  }) => {
    // TODO: open the bell, click an unread item, assert data-read="true" and
    // the unread badge count decrements; reload /notifications and confirm
    // persistence.
  });
});

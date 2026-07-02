import { test, expect } from '@playwright/test';

/**
 * US7 E2E SKELETON (T111): reminder rules configuration + SMS log visibility.
 * Covers configuring reminder rules (enable/disable, before/after day counts),
 * viewing the per-school SMS log, viewing the per-student SMS log, and
 * triggering + observing a manual reminder send.
 *
 * Auth: needs a seeded school_admin/accountant session (storageState) for an
 * ACTIVE school with SMS credit topped up. Skipped until the seeded-auth
 * Gauntlet environment is wired (T136); mirrors the US1/US4/US9 spec structure.
 */
test.describe('US7 — reminder rules + SMS log', () => {
  test.skip('school_admin can view and toggle the default reminder rules', async ({ page }) => {
    // TODO(T136): sign in as a seeded school_admin for an active school.
    await test.step('navigate to /settings/reminders', async () => {
      // TODO: await page.goto('/settings/reminders');
    });

    await test.step('three default rules are seeded (3 before / on / 3 after)', async () => {
      // TODO: assert three rows exist with labels قبل الاستحقاق / يوم الاستحقاق / بعد الاستحقاق,
      // the before/after rows default to 3 days, and all start enabled.
    });

    await test.step('disabling a rule persists after reload', async () => {
      // TODO: click the "مفعّل" toggle on the "before" rule, reload, assert
      // it now reads "معطّل".
    });

    await test.step('changing the day count persists after reload', async () => {
      // TODO: change the before-rule days input to 5, blur, reload, assert 5.
    });
  });

  test.skip('accountant can view the per-school SMS log with statuses', async ({ page }) => {
    // TODO: seed a few sms_message_log rows with queued/sent/delivered/failed
    // statuses across students, then:
    await test.step('navigate to /sms', async () => {
      // TODO: await page.goto('/sms');
    });

    await test.step('table shows recipient, text, segments, status, timestamp', async () => {
      // TODO: assert each row's status badge matches the seeded status label
      // (قيد الانتظار / أُرسلت / تم التسليم / فشلت).
    });
  });

  test.skip('per-student SMS log shows only that student\'s messages', async ({ page }) => {
    // TODO: seed messages for two students, navigate to
    // /students/{studentId}/sms for one of them, assert only that student's
    // rows appear.
  });

  test.skip('manual reminder button sends and logs a new SMS', async ({ page }) => {
    // TODO: navigate to a student's SMS page, click "إرسال تذكير الآن",
    // assert a success status message appears and a new row appears at the
    // top of the log table after refresh (is_manual = true).
  });

  test.skip('manual reminder surfaces INSUFFICIENT_CREDIT as an Arabic error', async ({
    page,
  }) => {
    // TODO: seed the school's SMS credit balance to 0, click the manual
    // reminder button, assert the Arabic "رصيد الرسائل غير كافٍ..." message
    // appears and no new sms_message_log row was created.
  });
});

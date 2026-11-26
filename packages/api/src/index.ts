import { createApp } from './app.js';
import { scheduleDailyReminders } from './cron/daily-reminders.js';
import { scheduleExpiryNotifications } from './cron/expiry-notifications.js';

const PORT = Number(process.env.PORT ?? 8080);

const app = createApp();

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[@erp/api] worker listening on :${PORT}`);
});

// Gated on SMS_DISPATCH_ENABLED internally.
scheduleDailyReminders();
// In-app notifications only (no SMS), so always registered.
scheduleExpiryNotifications();

import { createApp } from './app.js';
import { scheduleDailyReminders } from './cron/daily-reminders.js';
import { scheduleInvitationExpiry } from './cron/invitation-expiry.js';

const PORT = Number(process.env.PORT ?? 8080);

// Spec 002: invitation links are built from APP_URL; refuse to boot without it.
if (!process.env.APP_URL) {
  throw new Error('APP_URL must be set for @erp/api (invitation links, accept CORS)');
}

const app = createApp();

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[@erp/api] worker listening on :${PORT}`);
});

scheduleDailyReminders();
scheduleInvitationExpiry();

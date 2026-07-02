import { createApp } from './app.js';
import { scheduleDailyReminders } from './cron/daily-reminders.js';

const PORT = Number(process.env.PORT ?? 8080);

const app = createApp();

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[@erp/api] worker listening on :${PORT}`);
});

scheduleDailyReminders();

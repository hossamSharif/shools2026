import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright is the ONLY browser tool (Article XIII). Defaults are RTL/Arabic:
 * locale ar, timezone Africa/Khartoum, single Chromium project.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'html',
  // Next dev compiles each route on its first visit (can take >5s for a
  // route nobody has hit yet in this process) — give assertions more room
  // than the 5s default so a cold-compile isn't mistaken for a real failure.
  expect: { timeout: 15_000 },
  // Signs in the seeded Gauntlet users (see tests/global-setup.ts) and writes a
  // storageState file per role under tests/.auth/ — used by specs that need an
  // authenticated browser session (there is no /login UI yet to drive).
  globalSetup: './tests/global-setup.ts',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    locale: 'ar',
    timezoneId: 'Africa/Khartoum',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'pnpm --filter @erp/web dev',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});

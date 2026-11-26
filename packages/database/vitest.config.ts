import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Integration tests hit a real Supabase instance (Article X). They read
    // SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from the environment.
    // With REQUIRE_INTEGRATION_ENV=1 (CI), missing Supabase env fails the run
    // instead of silently skipping the access gates (spec 002, T084).
    globalSetup: ['./src/test-helpers/require-integration.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});

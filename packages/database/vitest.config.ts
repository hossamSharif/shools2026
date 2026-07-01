import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Integration tests hit a real Supabase instance (Article X). They read
    // SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from the environment.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});

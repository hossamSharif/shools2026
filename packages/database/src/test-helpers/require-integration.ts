/**
 * Vitest global setup (spec 002, T084, FR-035/SC-002). The integration suites
 * skip themselves when SUPABASE_URL / SUPABASE_ANON_KEY /
 * SUPABASE_SERVICE_ROLE_KEY are missing, which is right on a laptop but would
 * let CI pass without ever running the access gates. With
 * REQUIRE_INTEGRATION_ENV=1 (set it in CI), a missing variable fails the run
 * instead.
 */
export default function requireIntegrationEnv(): void {
  if (process.env.REQUIRE_INTEGRATION_ENV !== '1') return;
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const missing = [
    !url && 'SUPABASE_URL',
    !anon && 'SUPABASE_ANON_KEY',
    !process.env.SUPABASE_SERVICE_ROLE_KEY && 'SUPABASE_SERVICE_ROLE_KEY',
  ].filter(Boolean);
  if (missing.length) {
    throw new Error(
      `REQUIRE_INTEGRATION_ENV=1 but ${missing.join(', ')} not set: the access gates ` +
        '(src/access/*.test.ts, policy-audit.test.ts) would be skipped.',
    );
  }
}

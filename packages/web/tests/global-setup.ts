import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

/**
 * Playwright global setup: signs in the seeded Gauntlet test users
 * (packages/database/seeds/test_gauntlet_data.sql) via supabase-js
 * (password grant) and writes a Playwright storageState file per role,
 * injecting the session directly as the `sb-<project-ref>-auth-token`
 * cookie that @supabase/ssr's browser/server clients read.
 *
 * This exists because the app has no /login UI yet (middleware.ts treats
 * /login as public but no page is implemented there) — there is currently
 * no way to establish an authenticated browser session through the UI. This
 * bypasses that gap the same way a real browser would end up authenticated
 * (a valid Supabase session cookie), without fabricating a login flow that
 * doesn't exist.
 */

function loadRootEnv() {
  const envPath = path.resolve(__dirname, '../../../.env');
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

const AUTH_DIR = path.resolve(__dirname, '.auth');

export const USERS = {
  super_admin: { email: 'superadmin@gauntlet.test', password: 'password123' },
  school_admin_a: { email: 'admin.a@gauntlet.test', password: 'password123' },
  accountant_a: { email: 'accountant.a@gauntlet.test', password: 'password123' },
  viewer_a: { email: 'viewer.a@gauntlet.test', password: 'password123' },
  school_admin_b: { email: 'admin.b@gauntlet.test', password: 'password123' },
} as const;

function b64urlEncode(input: string): string {
  return Buffer.from(input, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export default async function globalSetup() {
  loadRootEnv();
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    console.warn('[global-setup] SUPABASE_URL/ANON_KEY not set — skipping storageState generation.');
    return;
  }

  const projectRef = new URL(url).hostname.split('.')[0];
  const cookieName = `sb-${projectRef}-auth-token`;
  fs.mkdirSync(AUTH_DIR, { recursive: true });

  for (const [key, creds] of Object.entries(USERS)) {
    const client = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.auth.signInWithPassword(creds);
    if (error || !data.session) {
      console.warn(`[global-setup] sign-in failed for ${creds.email}: ${error?.message}`);
      continue;
    }

    const cookieValue = 'base64-' + b64urlEncode(JSON.stringify(data.session));
    const domain = 'localhost';

    const storageState = {
      cookies: [
        {
          name: cookieName,
          value: cookieValue,
          domain,
          path: '/',
          expires: -1,
          httpOnly: false,
          secure: false,
          sameSite: 'Lax' as const,
        },
      ],
      origins: [],
    };

    fs.writeFileSync(
      path.join(AUTH_DIR, `${key}.json`),
      JSON.stringify(storageState, null, 2),
    );
  }
}

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
  accountant_grace: { email: 'accountant.grace@gauntlet.test', password: 'password123' },
  accountant_locked: { email: 'accountant.locked@gauntlet.test', password: 'password123' },
  accountant_e: { email: 'accountant.e@gauntlet.test', password: 'password123' },
} as const;

function b64urlEncode(input: string): string {
  return Buffer.from(input, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export default async function globalSetup(): Promise<void | (() => Promise<void>)> {
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
    writeStorageState(cookieName, key, data.session);
  }

  // Spec 002 (T069): the role fixture of the access matrix, only on request.
  if (process.env.E2E_ACCESS_FIXTURE === '1') return setupAccessFixture(cookieName);
}

function writeStorageState(cookieName: string, key: string, session: object) {
  const storageState = {
    cookies: [
      {
        name: cookieName,
        value: 'base64-' + b64urlEncode(JSON.stringify(session)),
        domain: 'localhost',
        path: '/',
        expires: -1,
        httpOnly: false,
        secure: false,
        sameSite: 'Lax' as const,
      },
    ],
    origins: [],
  };
  fs.writeFileSync(path.join(AUTH_DIR, `${key}.json`), JSON.stringify(storageState, null, 2));
}

/** Where the US4 spec reads the fixture's ids (schools, grades, students). */
export const ACCESS_FIXTURE_FILE = path.join(AUTH_DIR, 'access-fixture.json');

/** Fixture users with a browser session, as `tests/.auth/access_<name>.json`. */
export const ACCESS_BROWSER_USERS = ['sa', 'saMiddle', 'principal', 'teacher', 'adminA'] as const;

/**
 * Builds the access-matrix fixture (`buildAccessFixture`: two schools, every
 * staff role, students X/Y/Z) with the service key, writes a storageState per
 * browser user and the ids the spec needs, and returns the teardown that
 * removes it all. Loaded lazily so the default setup never imports it.
 */
async function setupAccessFixture(cookieName: string): Promise<() => Promise<void>> {
  const { buildAccessFixture, getServiceClient } = await import('@erp/database/test-fixtures');
  const service = getServiceClient();
  if (!service) throw new Error('[global-setup] E2E_ACCESS_FIXTURE=1 needs SUPABASE_SERVICE_ROLE_KEY');
  const fx = await buildAccessFixture(service);
  for (const name of ACCESS_BROWSER_USERS) {
    const { data } = await fx.users[name].client.auth.getSession();
    if (!data.session) throw new Error(`[global-setup] no session for fixture user ${name}`);
    writeStorageState(cookieName, `access_${name}`, data.session);
  }
  const { users, cleanup, ...ids } = fx;
  fs.writeFileSync(
    ACCESS_FIXTURE_FILE,
    JSON.stringify(
      {
        ...ids,
        users: Object.fromEntries(
          Object.entries(users).map(([k, u]) => [k, { userId: u.userId, email: u.email }]),
        ),
      },
      null,
      2,
    ),
  );
  return async () => {
    await cleanup();
    fs.rmSync(ACCESS_FIXTURE_FILE, { force: true });
  };
}


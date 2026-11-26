import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

/**
 * Invitation endpoints (spec 002, contracts/worker-endpoints.md, T055).
 * The real Express app runs on an ephemeral port; Supabase (service and
 * user-scoped clients) is mocked, since every decision is the database's.
 */

type Rpc = (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: unknown }>;

const state = {
  userRpc: (async () => ({ data: null, error: null })) as Rpc,
  serviceRpc: (async () => ({ data: null, error: null })) as Rpc,
  invitationByHash: null as null | { auth_user_id: string | null; email: string },
  invited: [] as { email: string; redirectTo: string; data: unknown }[],
  passwordSet: [] as string[],
  deletedUsers: [] as string[],
};

function chain(result: { data: unknown; error: unknown }) {
  const c: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'not', 'update']) c[m] = () => c;
  c.single = async () => result;
  c.maybeSingle = async () => result;
  c.then = (resolve: (v: unknown) => void) => resolve({ data: null, error: null });
  return c;
}

vi.mock('../middleware/user-client.js', async (orig) => {
  const real = await orig<typeof import('../middleware/user-client.js')>();
  return {
    ...real,
    createUserScopedClient: () => ({
      rpc: (fn: string, args: Record<string, unknown>) => state.userRpc(fn, args),
      from: (table: string) =>
        table === 'invitation'
          ? chain({
              data: {
                id: 'inv-1',
                email: 'new@example.test',
                auth_user_id: null,
                school_id: 'school-1',
              },
              error: null,
            })
          : chain({ data: { name: 'مدرسة الاختبار' }, error: null }),
    }),
  };
});

vi.mock('../supabase.js', () => ({
  createSupabaseServiceClient: () => ({
    rpc: (fn: string, args: Record<string, unknown>) => state.serviceRpc(fn, args),
    from: () => chain({ data: state.invitationByHash, error: null }),
    auth: {
      admin: {
        inviteUserByEmail: async (email: string, opts: { redirectTo: string; data: unknown }) => {
          state.invited.push({ email, redirectTo: opts.redirectTo, data: opts.data });
          return { data: { user: { id: 'auth-1' } }, error: null };
        },
        deleteUser: async (id: string) => {
          state.deletedUsers.push(id);
          return { error: null };
        },
        updateUserById: async (id: string) => {
          state.passwordSet.push(id);
          return { error: null };
        },
      },
    },
  }),
}));

const TOKEN = 'A'.repeat(43);
let server: Server;
let base: string;

beforeAll(async () => {
  process.env.INTERNAL_DISPATCH_TOKEN = 'internal-test-token';
  process.env.APP_URL = 'https://app.example.test';
  const { createApp } = await import('../app.js');
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server?.close();
});

beforeEach(() => {
  state.invited = [];
  state.passwordSet = [];
  state.deletedUsers = [];
  state.invitationByHash = null;
  state.userRpc = async (fn) =>
    fn === 'my_access'
      ? { data: { school_id: 'school-1' }, error: null }
      : fn === 'issue_invitation_token'
        ? { data: TOKEN, error: null }
        : { data: null, error: null };
  state.serviceRpc = async () => ({ data: { user_id: 'auth-1' }, error: null });
});

const send = (headers: Record<string, string>) =>
  fetch(`${base}/internal/invitations/00000000-0000-4000-8000-000000000001/send`, {
    method: 'POST',
    headers,
  });
const accept = (body: unknown) =>
  fetch(`${base}/invitations/accept`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('POST /internal/invitations/:id/send', () => {
  it('401 without the internal token', async () => {
    const r = await send({ 'x-user-jwt': 'jwt' });
    expect(r.status).toBe(401);
  });

  it('401 without x-user-jwt', async () => {
    const r = await send({ authorization: 'Bearer internal-test-token' });
    expect(r.status).toBe(401);
  });

  it('passes a database FORBIDDEN_PERMISSION through as 403, sending nothing', async () => {
    state.userRpc = async (fn) =>
      fn === 'my_access'
        ? { data: { school_id: 'school-1' }, error: null }
        : { data: null, error: { message: 'FORBIDDEN_PERMISSION' } };
    const r = await send({ authorization: 'Bearer internal-test-token', 'x-user-jwt': 'jwt' });
    expect(r.status).toBe(403);
    expect(await r.json()).toEqual({ error: 'FORBIDDEN_PERMISSION' });
    expect(state.invited).toHaveLength(0);
  });

  it('WRITES_GATED is 409', async () => {
    state.userRpc = async (fn) =>
      fn === 'my_access'
        ? { data: { school_id: 'school-1' }, error: null }
        : { data: null, error: { message: 'WRITES_GATED' } };
    const r = await send({ authorization: 'Bearer internal-test-token', 'x-user-jwt': 'jwt' });
    expect(r.status).toBe(409);
  });

  it('sends the invite mail with the token only in the link, never in metadata', async () => {
    const r = await send({ authorization: 'Bearer internal-test-token', 'x-user-jwt': 'jwt' });
    expect(r.status).toBe(200);
    expect(state.invited).toHaveLength(1);
    expect(state.invited[0]!.redirectTo).toBe(
      `https://app.example.test/auth/accept-invite?token=${TOKEN}`,
    );
    expect(JSON.stringify(state.invited[0]!.data)).not.toContain(TOKEN);
  });
});

describe('POST /invitations/accept', () => {
  it('400 on a malformed body', async () => {
    const r = await accept({ token: 'short', display_name: 'x', password: '1' });
    expect(r.status).toBe(400);
  });

  it('400 INVITATION_INVALID for an unknown token', async () => {
    const r = await accept({
      token: TOKEN,
      display_name: 'معلم جديد',
      password: 'a-long-password',
    });
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: 'INVITATION_INVALID' });
    expect(state.passwordSet).toHaveLength(0);
  });

  it('400 INVITATION_INVALID when the database refuses (used, revoked, expired)', async () => {
    state.invitationByHash = { auth_user_id: 'auth-1', email: 'new@example.test' };
    state.serviceRpc = async () => ({ data: null, error: { message: 'INVITATION_INVALID' } });
    const r = await accept({
      token: TOKEN,
      display_name: 'معلم جديد',
      password: 'a-long-password',
    });
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: 'INVITATION_INVALID' });
    expect(state.passwordSet).toHaveLength(0);
  });

  it('accepts, hashes the token and sets the password', async () => {
    state.invitationByHash = { auth_user_id: 'auth-1', email: 'new@example.test' };
    let hashArg: unknown;
    state.serviceRpc = async (_fn, args) => {
      hashArg = args.p_token_hash;
      return { data: { user_id: 'auth-1' }, error: null };
    };
    const r = await accept({
      token: TOKEN,
      display_name: 'معلم جديد',
      password: 'a-long-password',
    });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ email: 'new@example.test' });
    expect(String(hashArg)).toMatch(/^\\x[0-9a-f]{64}$/);
    expect(String(hashArg)).not.toContain(TOKEN);
    expect(state.passwordSet).toEqual(['auth-1']);
  });
});

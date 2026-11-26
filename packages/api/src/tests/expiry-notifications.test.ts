import { describe, it, expect, vi, beforeEach } from 'vitest';

const { scheduleMock, rpcMock, createClientMock } = vi.hoisted(() => {
  const rpcMock = vi.fn();
  return {
    scheduleMock: vi.fn(),
    rpcMock,
    createClientMock: vi.fn(() => ({ rpc: rpcMock })),
  };
});

vi.mock('node-cron', () => ({ default: { schedule: scheduleMock } }));
vi.mock('@supabase/supabase-js', () => ({ createClient: createClientMock }));

import {
  runExpiryNotifications,
  scheduleExpiryNotifications,
} from '../cron/expiry-notifications.js';

/**
 * T132 (US9): the expiring-soon notification job must be scheduled daily at
 * 08:00 Africa/Khartoum and call emit_expiry_notifications with a 7-day window.
 */
describe('expiry notifications cron', () => {
  beforeEach(() => {
    scheduleMock.mockReset();
    rpcMock.mockReset();
    createClientMock.mockClear();
    process.env.SUPABASE_URL = 'http://localhost:54321';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  });

  it('schedules a daily 08:00 job in the Africa/Khartoum timezone', () => {
    scheduleExpiryNotifications();

    expect(scheduleMock).toHaveBeenCalledTimes(1);
    const [expression, , options] = scheduleMock.mock.calls[0];
    expect(expression).toBe('0 8 * * *');
    expect(options).toEqual({ timezone: 'Africa/Khartoum' });
  });

  it('the scheduled callback calls emit_expiry_notifications with a 7-day window', async () => {
    rpcMock.mockResolvedValue({ data: 2, error: null });
    scheduleExpiryNotifications();

    const callback = scheduleMock.mock.calls[0][1] as () => void;
    callback();
    await vi.waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));

    expect(rpcMock).toHaveBeenCalledWith('emit_expiry_notifications', { p_within_days: 7 });
  });

  it('runExpiryNotifications returns the RPC count and rethrows RPC errors', async () => {
    rpcMock.mockResolvedValueOnce({ data: 3, error: null });
    await expect(runExpiryNotifications()).resolves.toBe(3);

    const err = { message: 'boom' };
    rpcMock.mockResolvedValueOnce({ data: null, error: err });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(runExpiryNotifications()).rejects.toBe(err);
    consoleSpy.mockRestore();
  });
});

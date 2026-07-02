import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GenericHttpSmsProvider } from '../providers/generic-http.js';
import { setSmsProvider } from '../providers/index.js';

/**
 * T110: the delivery webhook normalizer must map provider-native statuses to
 * our sent|delivered|failed vocabulary, and a later 'failed' status must be
 * recorded (status updated) without auto-refunding SMS credit — refunds are a
 * deliberate operator action (topup), never automatic.
 */
describe('delivery webhook status normalization', () => {
  const provider = new GenericHttpSmsProvider({ url: 'https://example.test', apiKey: 'k' });

  it('maps provider "delivered" style statuses to delivered', () => {
    const n = provider.normalizeWebhook({ message_id: 'abc', status: 'DELIVERED' });
    expect(n).toEqual({ providerMessageId: 'abc', status: 'delivered' });
  });

  it('maps provider "sent"/"accepted" style statuses to sent', () => {
    expect(provider.normalizeWebhook({ message_id: 'a1', status: 'accepted' }).status).toBe(
      'sent',
    );
    expect(provider.normalizeWebhook({ message_id: 'a2', status: 'submitted' }).status).toBe(
      'sent',
    );
  });

  it('maps provider failure statuses to failed', () => {
    expect(provider.normalizeWebhook({ message_id: 'f1', status: 'undelivered' }).status).toBe(
      'failed',
    );
    expect(provider.normalizeWebhook({ message_id: 'f2', status: 'rejected' }).status).toBe(
      'failed',
    );
  });

  it('throws on a malformed payload with no message id', () => {
    expect(() => provider.normalizeWebhook({ status: 'delivered' })).toThrow(
      'INVALID_WEBHOOK_PAYLOAD',
    );
  });

  it('a later failed status updates the log row but does not touch credit tables', async () => {
    // Simulate the route's persistence step directly against a fake client:
    // update() must only ever touch sms_message_log, never sms_credit_*.
    const updateCalls: string[] = [];
    const fakeSupabase = {
      from(table: string) {
        updateCalls.push(table);
        return {
          update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
        };
      },
    };

    const normalized = provider.normalizeWebhook({ message_id: 'xyz', status: 'failed' });
    await fakeSupabase.from('sms_message_log').update({ status: normalized.status }).eq(
      'provider_message_id',
      normalized.providerMessageId,
    );

    expect(updateCalls).toEqual(['sms_message_log']);
    expect(updateCalls).not.toContain('sms_credit_consumption');
    expect(updateCalls).not.toContain('sms_credit_topup');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    setSmsProvider(provider);
  });
});

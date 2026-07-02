import type {
  SmsProvider,
  SmsSendRequest,
  SmsSendResult,
  NormalizedWebhook,
} from '@erp/shared';
import { SmsStatus } from '@erp/shared';

/**
 * GenericHttpSmsProvider (T115) — a single swappable HTTP adapter (Article VI).
 * POSTs `{ to, body, idempotency_key }` to `SMS_PROVIDER_URL` with a bearer
 * token, and normalizes the provider's raw webhook payload to our
 * `queued|sent|delivered|failed` vocabulary. One adapter per deployment; the
 * worker only ever depends on the `SmsProvider` interface.
 */

export interface GenericHttpSmsProviderConfig {
  url: string;
  apiKey: string;
  /** Maps a raw provider status string (lowercased) to our normalized status. */
  statusMap?: Record<string, SmsStatus>;
}

const DEFAULT_STATUS_MAP: Record<string, SmsStatus> = {
  queued: 'queued',
  pending: 'queued',
  accepted: 'sent',
  sent: 'sent',
  submitted: 'sent',
  delivered: 'delivered',
  success: 'delivered',
  failed: 'failed',
  undelivered: 'failed',
  rejected: 'failed',
  error: 'failed',
};

export class GenericHttpSmsProvider implements SmsProvider {
  constructor(private readonly config: GenericHttpSmsProviderConfig) {}

  async send(req: SmsSendRequest): Promise<SmsSendResult> {
    const res = await fetch(this.config.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        to: req.to,
        body: req.body,
        idempotency_key: req.idempotencyKey,
      }),
    });

    if (!res.ok) {
      throw new Error(`SMS_PROVIDER_TRANSPORT_ERROR: ${res.status}`);
    }

    const payload = (await res.json()) as { message_id?: string; status?: string };
    const normalized = this.normalizeStatus(payload.status);

    return {
      providerMessageId: payload.message_id ?? null,
      status: normalized,
    };
  }

  normalizeWebhook(raw: unknown): NormalizedWebhook {
    if (typeof raw !== 'object' || raw === null) {
      throw new Error('INVALID_WEBHOOK_PAYLOAD');
    }
    const body = raw as Record<string, unknown>;
    const providerMessageId = String(
      body.provider_message_id ?? body.message_id ?? body.id ?? '',
    );
    if (!providerMessageId) {
      throw new Error('INVALID_WEBHOOK_PAYLOAD');
    }
    const status = this.normalizeStatus(String(body.status ?? ''));
    return { providerMessageId, status };
  }

  private normalizeStatus(raw: string | undefined): SmsStatus {
    const key = (raw ?? '').toLowerCase().trim();
    const map = { ...DEFAULT_STATUS_MAP, ...(this.config.statusMap ?? {}) };
    const parsed = SmsStatus.safeParse(map[key]);
    return parsed.success ? parsed.data : 'queued';
  }
}

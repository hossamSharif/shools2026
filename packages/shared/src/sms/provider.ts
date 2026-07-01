import { z } from 'zod';

/**
 * The single swappable SMS abstraction (Article VI). One adapter per deployment
 * (e.g. GenericHttpSmsProvider). The worker only ever depends on this interface.
 */

/** Normalized delivery status across providers. */
export const SmsStatus = z.enum(['queued', 'sent', 'delivered', 'failed']);
export type SmsStatus = z.infer<typeof SmsStatus>;

export interface SmsSendRequest {
  /** E.164-ish recipient phone number. */
  to: string;
  /** Arabic message body (already composed). */
  body: string;
  /** Idempotency key so a retry never double-sends. */
  idempotencyKey: string;
}

export interface SmsSendResult {
  /** Provider-side message id, if returned synchronously. */
  providerMessageId: string | null;
  /** Status the provider reports at accept time. */
  status: SmsStatus;
}

/** Result of normalizing an inbound provider delivery webhook. */
export interface NormalizedWebhook {
  providerMessageId: string;
  status: SmsStatus;
}

export interface SmsProvider {
  /** Send one message. Throws on transport failure (caller does NOT consume credit). */
  send(req: SmsSendRequest): Promise<SmsSendResult>;
  /** Map a raw provider webhook body to a normalized delivery status. */
  normalizeWebhook(raw: unknown): NormalizedWebhook;
}

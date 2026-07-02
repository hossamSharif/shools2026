import { Router, type Router as RouterType } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { DeliveryWebhookInput, type DeliveryWebhookOutput } from '@erp/shared';
import { createSupabaseServiceClient } from '../supabase.js';
import { getSmsProvider } from '../providers/index.js';

/**
 * POST /webhooks/sms/delivery (T119) — secret-verified inbound provider
 * webhook. Normalizes the provider's raw status to our vocabulary, persists
 * it against the matching sms_message_log row by provider_message_id, and
 * always replies 200 (idempotent — replays / unknown ids are no-ops).
 * A later 'failed' status is RECORDED but never auto-refunds credit (T110).
 */
export const deliveryWebhookRouter: RouterType = Router();

function requireWebhookSecret(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.SMS_WEBHOOK_SECRET;
  const provided = req.header('x-webhook-secret');
  if (!expected || !provided || provided !== expected) {
    res.status(401).json({ error: 'UNAUTHORIZED' });
    return;
  }
  next();
}

deliveryWebhookRouter.post('/webhooks/sms/delivery', requireWebhookSecret, async (req, res) => {
  const provider = getSmsProvider();

  let normalized;
  try {
    normalized = provider.normalizeWebhook(req.body);
  } catch {
    // Malformed payload: acknowledge anyway (providers retry on non-2xx).
    return res.status(200).json({ ok: true } satisfies DeliveryWebhookOutput);
  }

  const parsed = DeliveryWebhookInput.safeParse({
    provider_message_id: normalized.providerMessageId,
    status: normalized.status,
  });
  if (!parsed.success) {
    return res.status(200).json({ ok: true } satisfies DeliveryWebhookOutput);
  }

  const supabase = createSupabaseServiceClient();
  await supabase
    .from('sms_message_log')
    .update({ status: normalized.status })
    .eq('provider_message_id', normalized.providerMessageId);

  return res
    .status(200)
    .json({ ok: true, status: normalized.status } satisfies DeliveryWebhookOutput);
});

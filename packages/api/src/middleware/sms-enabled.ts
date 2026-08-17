import type { NextFunction, Request, Response } from 'express';

/**
 * Global kill switch for all outbound SMS. Defaults to OFF: dispatch runs only
 * when SMS_DISPATCH_ENABLED is exactly "true".
 *
 * Off-by-default is deliberate. Both dispatch paths call `consume_sms_credit`
 * BEFORE `provider.send` and, per T110, do NOT refund on a transport failure
 * (run-dispatch.ts:171). So with no provider configured, every reminder the
 * scheduler matched would burn real SMS credit and leave a `failed` row in
 * `sms_message_log` — a silent, per-school credit drain. An unconfigured
 * deployment must therefore send nothing at all rather than fail per-message.
 *
 * To enable later: configure the provider secrets, then set
 * SMS_DISPATCH_ENABLED=true.
 */
export function isSmsDispatchEnabled(): boolean {
  return process.env.SMS_DISPATCH_ENABLED === 'true';
}

/** Short-circuits the /internal/dispatch/* routes while SMS is switched off. */
export function requireSmsEnabled(_req: Request, res: Response, next: NextFunction): void {
  if (!isSmsDispatchEnabled()) {
    res.status(503).json({ error: 'SMS_DISPATCH_DISABLED' });
    return;
  }
  next();
}

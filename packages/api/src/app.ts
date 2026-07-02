import express, { type Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { dispatchRunRouter } from './routes/dispatch-run.js';
import { dispatchManualRouter } from './routes/dispatch-manual.js';
import { deliveryWebhookRouter } from './routes/delivery-webhook.js';

/**
 * Builds the Express worker app: cron-driven reminder dispatch + provider
 * delivery webhook (Article VI — the only long-running process). Hardened with
 * helmet, CORS, and rate limiting; routes are mounted per user story (Phase 9).
 */
export function createApp(): Express {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: false }));
  app.use(express.json({ limit: '256kb' }));
  app.use(
    rateLimit({
      windowMs: 60_000,
      limit: 120,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Phase 9 (US7): reminder dispatch + provider delivery webhook.
  app.use(dispatchRunRouter);
  app.use(dispatchManualRouter);
  app.use(deliveryWebhookRouter);

  return app;
}

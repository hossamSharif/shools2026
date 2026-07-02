import type { NextFunction, Request, Response } from 'express';

/**
 * Guards `/internal/*` worker endpoints with a shared-secret bearer token
 * (INTERNAL_DISPATCH_TOKEN). These endpoints are called by the cron scheduler
 * and by the tenant web app's server actions — never exposed to browsers.
 */
export function requireInternalToken(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.INTERNAL_DISPATCH_TOKEN;
  const header = req.header('authorization');
  const provided = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;

  if (!expected || !provided || provided !== expected) {
    res.status(401).json({ error: 'UNAUTHORIZED' });
    return;
  }
  next();
}

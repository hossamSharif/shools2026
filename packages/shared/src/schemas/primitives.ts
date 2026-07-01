import { z } from 'zod';

/**
 * Canonical Zod primitives — the single source of truth for boundary validation
 * (Article XI). Money crosses the wire as a decimal STRING to avoid float
 * (Article I); it maps to Postgres NUMERIC(14,2).
 */

/** NUMERIC(14,2) as a decimal string: up to 12 integer digits, up to 2 fraction digits. */
export const Money = z.string().regex(/^\d{1,12}(\.\d{1,2})?$/, 'invalid money amount');
export type Money = z.infer<typeof Money>;

/** UUID (v4-shaped) used for all entity identifiers. */
export const Uuid = z.string().uuid();
export type Uuid = z.infer<typeof Uuid>;

/** Idempotency key on every money-submitting / message-sending operation (Article I/VII). */
export const IdempotencyKey = z.string().uuid();
export type IdempotencyKey = z.infer<typeof IdempotencyKey>;

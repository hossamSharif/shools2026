import { z } from 'zod';
import { Uuid, IdempotencyKey } from './primitives.js';

/** Super-admin onboarding schemas (US1). Boundary validation — Article XI. */

export const CreateSchoolInput = z.object({
  name: z.string().min(1, 'اسم المدرسة مطلوب').max(200),
});
export type CreateSchoolInput = z.infer<typeof CreateSchoolInput>;

export const SetSubscriptionInput = z
  .object({
    school_id: Uuid,
    period_start: z.string().date(),
    period_end: z.string().date(),
    grace_days: z.number().int().min(0).default(14),
  })
  .refine((v) => v.period_end >= v.period_start, {
    message: 'نهاية الاشتراك يجب أن تكون بعد بدايته',
    path: ['period_end'],
  });
export type SetSubscriptionInput = z.infer<typeof SetSubscriptionInput>;

export const TopupSmsCreditInput = z.object({
  school_id: Uuid,
  amount: z.number().int().positive(),
  idempotency_key: IdempotencyKey,
});
export type TopupSmsCreditInput = z.infer<typeof TopupSmsCreditInput>;

export const TopupSmsCreditOutput = z.object({
  topup_id: Uuid,
  credit_balance_after: z.number().int(),
});
export type TopupSmsCreditOutput = z.infer<typeof TopupSmsCreditOutput>;

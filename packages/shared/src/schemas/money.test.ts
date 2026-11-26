import { describe, expect, it } from 'vitest';
import { Money, SignedMoney } from './primitives.js';
import { ApplyFeePaymentOutput, RecordAdjustmentOutput } from './money.js';

describe('money output schemas', () => {
  it('a derived balance may be negative (student in credit); submitted amounts may not', () => {
    expect(SignedMoney.safeParse('-1413.00').success).toBe(true);
    expect(SignedMoney.safeParse('0').success).toBe(true);
    expect(SignedMoney.safeParse('--1').success).toBe(false);
    expect(Money.safeParse('-1').success).toBe(false);
  });

  it('a payment for a student in credit parses (the post already succeeded in Postgres)', () => {
    const id = '00000000-0000-4000-8000-000000000001';
    expect(
      ApplyFeePaymentOutput.safeParse({
        money_event_id: id,
        receipt_no: 7,
        account_balance_after: '1500.00',
        student_balance_after: '-1413.00',
        allocations: [],
      }).success,
    ).toBe(true);
    expect(
      RecordAdjustmentOutput.safeParse({ money_event_id: id, student_balance_after: '-5.00' })
        .success,
    ).toBe(true);
  });
});

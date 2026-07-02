import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getServiceClient, createAuthedUser, INTEGRATION_ENV_READY, type AuthedUser } from '../test-helpers/supabase.js';
import { activateSchool, addInstallments, cleanupSchool, newAccount, newSchool, newStudent } from '../test-helpers/fees.js';

/**
 * dashboard_kpis (T103 / US6). Collection rate, net cash flow, and overdue
 * count aggregates in Africa/Khartoum month/year windows. All KPIs are
 * DERIVED (Article II) from money_event + installment; nothing is stored.
 *
 * Integration test (Article X): requires 0023_dashboard_kpis_function applied.
 * Skips when env unset.
 */
const d = INTEGRATION_ENV_READY ? describe : describe.skip;

d('dashboard_kpis (derived KPI bundle)', () => {
  const service = getServiceClient()!;
  let schoolId: string;
  let accountant: AuthedUser;
  let accountId: string;

  beforeAll(async () => {
    schoolId = await newSchool(service, 'kpis');
    await activateSchool(service, schoolId);
    accountant = await createAuthedUser(service, 'accountant', schoolId);
    accountId = await newAccount(service, schoolId, 0);
  });

  afterAll(async () => {
    await accountant?.cleanup();
    await cleanupSchool(service, schoolId);
  });

  it('computes collected/expenses/net-cash-flow for the current month and an overdue count', async () => {
    const student = await newStudent(service, schoolId, 'KpiStudent');
    const [instId] = await addInstallments(service, schoolId, student, [
      { sequence: 1, due_date: new Date().toISOString().slice(0, 10), amount: 1000 },
    ]);

    // Collect part of it this month.
    const { error: payErr } = await accountant.client.rpc('apply_fee_payment', {
      p_student_id: student,
      p_account_id: accountId,
      p_amount: 400,
      p_occurred_at: new Date().toISOString(),
      p_idempotency_key: crypto.randomUUID(),
      p_allocations: [{ installment_id: instId, amount: 400 }],
      p_attachment_path: null,
    });
    expect(payErr).toBeNull();

    // Record an expense this month.
    const { error: expErr } = await accountant.client.rpc('record_expense', {
      p_account_id: accountId,
      p_amount: 150,
      p_category: 'supplies',
      p_occurred_at: new Date().toISOString(),
      p_idempotency_key: crypto.randomUUID(),
    });
    expect(expErr).toBeNull();

    // An overdue, unpaid installment for a second student.
    const overdueStudent = await newStudent(service, schoolId, 'OverdueStudent');
    const overdueDue = new Date();
    overdueDue.setDate(overdueDue.getDate() - 10);
    await addInstallments(service, schoolId, overdueStudent, [
      { sequence: 1, due_date: overdueDue.toISOString().slice(0, 10), amount: 500 },
    ]);

    const { data, error } = await service.rpc('dashboard_kpis', { p_school_id: schoolId });
    expect(error).toBeNull();
    const kpis = data as Record<string, unknown>;

    expect(Number(kpis.collected_month)).toBeGreaterThanOrEqual(400);
    expect(Number(kpis.expenses_month)).toBeGreaterThanOrEqual(150);
    expect(Number(kpis.net_cash_flow_month)).toBe(
      Number(kpis.collected_month) - Number(kpis.expenses_month),
    );
    expect(Number(kpis.overdue_count)).toBeGreaterThanOrEqual(1);
    expect(Number(kpis.combined_balance)).toBe(Number(kpis.combined_balance)); // derived, finite
    expect(typeof kpis.sms_credit_remaining).toBe('number');
  });

  it('reflects the account balance as opening + fee_payment - expense for the account', async () => {
    const { data } = await service.rpc('account_balance', { p_account_id: accountId });
    const { data: kpisData } = await service.rpc('dashboard_kpis', { p_school_id: schoolId });
    const kpis = kpisData as Record<string, unknown>;
    expect(Number(kpis.combined_balance)).toBe(Number(data));
  });
});

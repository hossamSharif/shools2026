import { describe, expect, it } from 'vitest';
import {
  ACCESS_EXPECTATIONS,
  DATA_SETS,
  DERIVED_FUNCTIONS,
  FIXTURE_USERS,
  effectiveKeys,
  FIXTURE_PROFILES,
} from './matrix.js';

const E = ACCESS_EXPECTATIONS;

describe('ACCESS_EXPECTATIONS', () => {
  it('covers every fixture user × data set and derived function', () => {
    for (const u of FIXTURE_USERS) {
      for (const t of [...DATA_SETS, ...DERIVED_FUNCTIONS])
        expect(E[u][t], `${u}.${t}`).toBeDefined();
    }
  });

  it('matches the examples named in tasks T020', () => {
    expect(E.teacher.money_event.read).toBe('none');
    expect(E.principal.dashboard_kpis).toEqual({ read: 'totals' });
    expect(E.sa.student_directory).toEqual({ read: 'masked', rowsOf: ['X', 'Y', 'Z'] });
    expect(E.principalPrimary.student).toMatchObject({ read: 'scoped', rowsOf: ['X'] });
    expect(E.guardianX.student).toMatchObject({ read: 'scoped', rowsOf: ['X'] });
  });

  it('spec US1 cases', () => {
    // US1-1/2/4: teacher sees no finance and no student structure rows
    for (const t of [
      'money_event',
      'installment',
      'receipt_counter',
      'student',
      'section',
      'enrollment',
      'academic_year',
    ] as const)
      expect(E.teacher[t].read, t).toBe('none');
    for (const f of [
      'student_statement',
      'receivables_aging',
      'dashboard_kpis',
      'account_balance',
      'student_balance',
      'student_financial_summary',
    ] as const)
      expect(E.teacher[f].read, f).toBe('refused');
    // US1-5: no School A user sees B
    for (const u of FIXTURE_USERS.filter((x) => FIXTURE_PROFILES[x].school === 'A'))
      expect(E[u].student.rowsOf ?? [], u).not.toContain('B');
    // Phase 1 gap: viewer cannot post a payment
    expect(E.viewer.apply_fee_payment.write).toBe('refused');
    expect(E.accountant.apply_fee_payment.write).toBe('allowed');
    // stage scope and withdrawn Z
    expect(E.principalPrimary.student.rowsOf).not.toContain('Y');
    expect(E.saMiddle.student.rowsOf).toEqual(['Y']);
    expect(E.principal.student.rowsOf).toContain('Z');
  });

  it('multi-role is the union (FR-004/009, Article XIV)', () => {
    expect(E.principalViewer.money_event.read).toBe('all');
    expect(E.principalViewer.apply_fee_payment.write).toBe('refused');
    expect(E.principalViewer.dashboard_kpis.read).toBe('all');
    expect(effectiveKeys(FIXTURE_PROFILES.teacherSa).has('students.write')).toBe(true);
    expect(E.teacherSa.money_event.read).toBe('none');
  });

  it('super-admin is walled off from finance (FR-024)', () => {
    expect(E.superAdmin.money_event.read).toBe('none');
    expect(E.superAdmin.dashboard_kpis.read).toBe('refused');
    expect(E.superAdmin.school.read).toBe('all');
    expect(E.superAdmin.topup_sms_credit.write).toBe('allowed');
  });

  it('guardian reaches finance only through the linked-student summary (FR-014)', () => {
    expect(E.guardianX.student_financial_summary).toEqual({ read: 'scoped', rowsOf: ['X'] });
    expect(E.guardianX.student_statement.read).toBe('refused');
    expect(E.studentY.student_financial_summary.read).toBe('refused');
    expect(E.guardianX.money_event.read).toBe('none');
  });
});

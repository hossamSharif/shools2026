import type { AuthContext } from './guard.js';

/**
 * What the student screens may show or offer (spec 002, T068). UX only: every
 * flag mirrors a database decision that refuses on its own (FR-019). Plain data,
 * so server pages compute it once and pass it to client components.
 */
export interface StudentCaps {
  /** Amounts, schedules, payments, statements (`finance.read`). */
  finance: boolean;
  /** Payment and discount actions (`finance.write`). */
  financeWrite: boolean;
  /** Three-state fee badge without amounts (`finance.read` or `students.fee_indicator`). */
  indicator: boolean;
  /** Create, edit, enroll, archive (`students.write`). */
  write: boolean;
  delete: boolean;
  export: boolean;
  smsManual: boolean;
  /**
   * Stages the caller may register into, or null when `students.write` is
   * school-wide. A scoped writer cannot insert a bare student (0038): the UI
   * offers the combined register + enroll form instead.
   */
  writeStages: string[] | null;
}

export function studentCaps(ctx: AuthContext): StudentCaps {
  const has = (k: string) => ctx.permissions.has(k);
  const write = has('students.write');
  return {
    finance: has('finance.read'),
    financeWrite: has('finance.write'),
    indicator: has('finance.read') || has('students.fee_indicator'),
    write,
    delete: has('students.delete'),
    export: has('students.export'),
    smsManual: has('sms.send_manual'),
    writeStages: write ? (ctx.stageScope['students.write'] ?? null) : null,
  };
}

'use server';

import { requireRole } from '../auth/guard.js';
import { studentInstallments, type OutstandingInstallment } from '../queries/balances.js';

/**
 * Server-action wrapper so the client payment form can lazily load a student's
 * installments after selection. Read-only; RLS + role guard enforce tenant scope.
 */
export async function studentInstallmentsClient(
  studentId: string,
): Promise<OutstandingInstallment[]> {
  await requireRole('school_admin', 'accountant', 'viewer');
  return studentInstallments(studentId);
}

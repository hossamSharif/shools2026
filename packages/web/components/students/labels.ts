import type { StudentStatus } from '../../lib/queries/students.js';

/**
 * Arabic labels for student status.
 *
 * Deliberately a plain module with NO `'use client'`: this map is consumed by
 * both the server-rendered profile page and the client table/card list. A
 * non-component value exported from a client module becomes a client reference
 * that RSC cannot serialize — importing it from a server component fails at
 * render time with "Could not find the module … in the React Client Manifest"
 * (and neither `tsc` nor `next build` catches it, only an actual request does).
 */
export const STUDENT_STATUS_AR: Record<StudentStatus, string> = {
  active: 'نشط',
  withdrawn: 'منسحب',
  graduated: 'متخرج',
};

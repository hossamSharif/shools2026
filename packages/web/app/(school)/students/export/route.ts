import { NextResponse } from 'next/server';
import { hasPermission, requireAuth } from '../../../../lib/auth/guard.js';
import { studentCaps } from '../../../../lib/auth/student-caps.js';
import { studentDirectory } from '../../../../lib/queries/students.js';
import { studentsToCsv } from '../../../../lib/export/students-export.js';

/**
 * CSV export of the students directory. Takes the exact same query params as
 * the page, so "تصدير" always exports what the operator is currently looking at.
 */
export async function GET(request: Request) {
  const ctx = await requireAuth();
  // Route handlers answer 403 instead of redirecting (contracts/web-routes.md).
  if (!hasPermission(ctx, 'students.export')) {
    return NextResponse.json({ error: 'FORBIDDEN_PERMISSION' }, { status: 403 });
  }
  if (!ctx.schoolId) {
    return NextResponse.json({ error: 'no_school' }, { status: 400 });
  }

  const caps = studentCaps(ctx);
  const p = new URL(request.url).searchParams;
  const due = p.get('due');
  const rows = await studentDirectory(ctx.schoolId, {
    q: p.get('q') ?? undefined,
    stageId: p.get('stageId') ?? undefined,
    gradeId: p.get('gradeId') ?? undefined,
    sectionId: p.get('sectionId') ?? undefined,
    academicYearId: p.get('yearId') ?? undefined,
    status: p.get('status') ?? undefined,
    // Finance filters only where the directory allows them (it refuses otherwise).
    finStatus: caps.indicator ? (p.get('fin') ?? undefined) : undefined,
    dueWithinDays: caps.finance && due ? Number(due) : undefined,
    unenrolled: p.get('unenrolled') === '1',
    missingPhone: p.get('nophone') === '1',
    sort: caps.finance ? (p.get('sort') ?? undefined) : undefined,
  });

  return new NextResponse(studentsToCsv(rows, caps), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="students.csv"',
    },
  });
}

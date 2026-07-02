import { NextResponse } from 'next/server';
import { requireAuth } from '../../../../../lib/auth/guard.js';
import { receivablesAging } from '../../../../../lib/queries/receivables.js';
import { receivablesToCsv } from '../../../../../lib/export/receivables-export.js';

/** Tabular (CSV) export of the receivables aging report (US5, T101). */
export async function GET(request: Request) {
  const ctx = await requireAuth();
  if (!ctx.schoolId) {
    return NextResponse.json({ error: 'no_school' }, { status: 400 });
  }

  const url = new URL(request.url);
  const rows = await receivablesAging({
    schoolId: ctx.schoolId,
    stageId: url.searchParams.get('stageId') ?? undefined,
    gradeId: url.searchParams.get('gradeId') ?? undefined,
    sectionId: url.searchParams.get('sectionId') ?? undefined,
  });

  const csv = receivablesToCsv(rows);

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="receivables.csv"',
    },
  });
}

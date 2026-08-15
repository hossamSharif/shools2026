import type * as ReactPdf from '@react-pdf/renderer';

/**
 * Student statement PDF template (US5, T099; extended by the students-section
 * enhancement). RTL Arabic layout, SDG amounts. Amounts are pre-formatted
 * strings (Money) — no math here (Article VI). Mirrors pdf/receipt.tsx
 * conventions.
 *
 * Server-only module (used solely by the statement PDF route handler, never
 * by a client component) — loaded via a genuine Node `require()` rather than
 * a static import. @react-pdf's reconciler uses class components
 * (`React.Component`), which Next's RSC/route-handler bundling strips under
 * the "react-server" module condition, crashing at runtime with "a.Component
 * is not a constructor". `eval('require')` is opaque to webpack's static
 * analysis, so it resolves via plain Node module resolution instead — a real
 * bug found while running the Gauntlet E2E specs for the first time (no route
 * using server-side @react-pdf/renderer had ever been exercised before).
 */
const { Document, Page, Text, View, StyleSheet } = (eval('require') as NodeRequire)(
  '@react-pdf/renderer',
) as typeof ReactPdf;

export interface StatementPdfRow {
  date: string;
  typeLabel: string;
  description: string;
  charge: string;
  credit: string;
  runningBalance: string;
}

export interface StatementPdfInstallment {
  label: string;
  dueDate: string;
  amount: string;
  paid: string;
  remaining: string;
  statusLabel: string;
}

export interface StatementData {
  studentName: string;
  gradeLabel?: string;
  sectionName?: string;
  academicYear?: string;
  guardianName?: string;
  guardianPhone?: string;
  studentStatusLabel?: string;
  /** Header figures from `student_financial_summary`, pre-formatted. */
  summary?: {
    totalCharged: string;
    totalDiscount: string;
    totalPaid: string;
    collectionRate: string;
    nextDueDate?: string;
    nextDueAmount?: string;
    daysOverdue?: number;
    overdueAmount?: string;
    installmentsSettled: number;
    installmentsTotal: number;
  };
  installments?: StatementPdfInstallment[];
  totalOwed: string;
  rows: StatementPdfRow[];
  printedAt?: string;
}

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, direction: 'rtl' },
  title: { fontSize: 18, marginBottom: 4, textAlign: 'center' },
  subtitle: { fontSize: 11, marginBottom: 12, textAlign: 'center', color: '#666' },
  sectionTitle: { fontSize: 12, marginTop: 14, marginBottom: 6, textAlign: 'right' },
  headerRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    paddingVertical: 4,
    marginBottom: 8,
  },
  infoGrid: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    borderTop: '1px solid #ddd',
    borderBottom: '1px solid #ddd',
    paddingVertical: 6,
  },
  infoCell: { width: '25%', paddingVertical: 3, textAlign: 'right' },
  infoLabel: { fontSize: 8, color: '#888' },
  table: { borderTop: '1px solid #ddd' },
  row: {
    flexDirection: 'row-reverse',
    borderBottom: '1px solid #eee',
    paddingVertical: 5,
  },
  headRow: {
    flexDirection: 'row-reverse',
    backgroundColor: '#f5f5f5',
    paddingVertical: 5,
    fontWeight: 'bold',
  },
  cellDate: { width: '15%', textAlign: 'center' },
  cellType: { width: '15%', textAlign: 'center' },
  cellDesc: { width: '30%', textAlign: 'right', paddingRight: 4 },
  cellAmount: { width: '15%', textAlign: 'center' },
  instLabel: { width: '22%', textAlign: 'right', paddingRight: 4 },
  instCell: { width: '19.5%', textAlign: 'center' },
  instStatus: { width: '20%', textAlign: 'center' },
  totalBox: {
    marginTop: 16,
    padding: 10,
    backgroundColor: '#fef2f2',
    textAlign: 'center',
  },
  overdueBox: {
    marginTop: 8,
    padding: 8,
    backgroundColor: '#fff7ed',
    textAlign: 'center',
    fontSize: 9,
  },
  footer: { marginTop: 18, fontSize: 8, color: '#999', textAlign: 'center' },
});

function Info({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoCell}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text>{value}</Text>
    </View>
  );
}

export function StatementDocument({ data }: { data: StatementData }) {
  const s = data.summary;
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>كشف حساب الطالب</Text>
        <Text style={styles.subtitle}>
          {data.studentName}
          {data.gradeLabel
            ? ` — ${[data.gradeLabel, data.sectionName].filter(Boolean).join(' - ')}`
            : ''}
          {data.academicYear ? ` — ${data.academicYear}` : ''}
        </Text>

        {/* ── بيانات الطالب ── */}
        <View style={styles.infoGrid}>
          <Info label="اسم الطالب" value={data.studentName} />
          <Info label="ولي الأمر" value={data.guardianName ?? '—'} />
          <Info label="الهاتف" value={data.guardianPhone ?? '—'} />
          <Info label="حالة الطالب" value={data.studentStatusLabel ?? '—'} />
          <Info label="الصف / الشعبة" value={
            data.gradeLabel
              ? [data.gradeLabel, data.sectionName].filter(Boolean).join(' - ')
              : 'غير مسجّل'
          } />
          <Info label="العام الدراسي" value={data.academicYear ?? '—'} />
        </View>

        {/* ── الملخص المالي ── */}
        {s ? (
          <>
            <Text style={styles.sectionTitle}>الملخص المالي</Text>
            <View style={styles.infoGrid}>
              <Info label="إجمالي الرسوم" value={s.totalCharged} />
              <Info label="إجمالي الخصومات" value={s.totalDiscount} />
              <Info label="إجمالي المدفوع" value={s.totalPaid} />
              <Info label="الرصيد المستحق" value={data.totalOwed} />
              <Info label="نسبة السداد" value={`${s.collectionRate}%`} />
              <Info
                label="الأقساط المسددة"
                value={`${s.installmentsSettled} من ${s.installmentsTotal}`}
              />
              <Info label="الاستحقاق القادم" value={s.nextDueDate ?? '—'} />
              <Info label="مبلغ الاستحقاق القادم" value={s.nextDueAmount ?? '—'} />
            </View>
            {s.daysOverdue && s.daysOverdue > 0 ? (
              <View style={styles.overdueBox}>
                <Text>
                  متأخر منذ {s.daysOverdue} يوماً — المبلغ المتأخر: {s.overdueAmount ?? '—'}
                </Text>
              </View>
            ) : null}
          </>
        ) : null}

        {/* ── جدول الأقساط ── */}
        {data.installments && data.installments.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>جدول الأقساط</Text>
            <View style={styles.table}>
              <View style={styles.headRow}>
                <Text style={styles.instLabel}>القسط</Text>
                <Text style={styles.instCell}>الاستحقاق</Text>
                <Text style={styles.instCell}>المبلغ</Text>
                <Text style={styles.instCell}>المدفوع</Text>
                <Text style={styles.instCell}>المتبقي</Text>
                <Text style={styles.instStatus}>الحالة</Text>
              </View>
              {data.installments.map((it, i) => (
                <View style={styles.row} key={i}>
                  <Text style={styles.instLabel}>{it.label}</Text>
                  <Text style={styles.instCell}>{it.dueDate}</Text>
                  <Text style={styles.instCell}>{it.amount}</Text>
                  <Text style={styles.instCell}>{it.paid}</Text>
                  <Text style={styles.instCell}>{it.remaining}</Text>
                  <Text style={styles.instStatus}>{it.statusLabel}</Text>
                </View>
              ))}
            </View>
          </>
        ) : null}

        {/* ── كشف الحساب التفصيلي ── */}
        <Text style={styles.sectionTitle}>كشف الحساب التفصيلي</Text>
        <View style={styles.table}>
          <View style={styles.headRow}>
            <Text style={styles.cellDate}>التاريخ</Text>
            <Text style={styles.cellType}>النوع</Text>
            <Text style={styles.cellDesc}>الوصف</Text>
            <Text style={styles.cellAmount}>مدين</Text>
            <Text style={styles.cellAmount}>دائن</Text>
            <Text style={styles.cellAmount}>الرصيد</Text>
          </View>
          {data.rows.map((r, i) => (
            <View style={styles.row} key={i}>
              <Text style={styles.cellDate}>{r.date}</Text>
              <Text style={styles.cellType}>{r.typeLabel}</Text>
              <Text style={styles.cellDesc}>{r.description}</Text>
              <Text style={styles.cellAmount}>{r.charge}</Text>
              <Text style={styles.cellAmount}>{r.credit}</Text>
              <Text style={styles.cellAmount}>{r.runningBalance}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totalBox}>
          <Text>إجمالي المستحق: {data.totalOwed}</Text>
        </View>

        {data.printedAt ? (
          <Text style={styles.footer}>تاريخ الطباعة: {data.printedAt}</Text>
        ) : null}
      </Page>
    </Document>
  );
}

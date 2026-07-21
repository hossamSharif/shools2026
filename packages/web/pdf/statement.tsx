import type * as ReactPdf from '@react-pdf/renderer';

/**
 * Student statement PDF template (US5, T099). RTL Arabic layout, SDG amounts.
 * Amounts are decimal strings (Money) — no math here (Article VI). Mirrors
 * pdf/receipt.tsx conventions.
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

export interface StatementData {
  studentName: string;
  gradeLabel?: string;
  sectionName?: string;
  totalOwed: string;
  rows: StatementPdfRow[];
}

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, direction: 'rtl' },
  title: { fontSize: 18, marginBottom: 4, textAlign: 'center' },
  subtitle: { fontSize: 11, marginBottom: 16, textAlign: 'center', color: '#666' },
  headerRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    paddingVertical: 4,
    marginBottom: 8,
  },
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
  totalBox: {
    marginTop: 16,
    padding: 10,
    backgroundColor: '#fef2f2',
    textAlign: 'center',
  },
});

export function StatementDocument({ data }: { data: StatementData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>كشف حساب الطالب</Text>
        <Text style={styles.subtitle}>
          {data.studentName}
          {data.gradeLabel ? ` — ${[data.gradeLabel, data.sectionName].filter(Boolean).join(' - ')}` : ''}
        </Text>

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
      </Page>
    </Document>
  );
}

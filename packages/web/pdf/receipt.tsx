import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

/**
 * Money-event fee-payment receipt (US3). RTL Arabic layout. Amounts are decimal
 * strings (Money) — no math here. Rendered by the receipt route (client
 * PDFViewer) or reused server-side. Note: default @react-pdf fonts do not shape
 * Arabic perfectly; register an Arabic TTF font for production-grade shaping.
 */

export interface ReceiptData {
  receiptNo: number;
  studentName: string;
  gradeLabel?: string;
  sectionName?: string;
  accountName: string;
  amount: string;
  date: string;
  runningBalance?: string;
}

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 12, direction: 'rtl' },
  title: { fontSize: 20, marginBottom: 4, textAlign: 'center' },
  subtitle: { fontSize: 12, marginBottom: 20, textAlign: 'center', color: '#666' },
  row: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottom: '1px solid #eee',
  },
  label: { color: '#555' },
  value: { fontWeight: 'bold' },
  amountBox: {
    marginTop: 20,
    padding: 12,
    backgroundColor: '#f0fdf4',
    textAlign: 'center',
  },
  amount: { fontSize: 18 },
});

function Line({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

export function ReceiptDocument({ data }: { data: ReceiptData }) {
  return (
    <Document>
      <Page size="A5" style={styles.page}>
        <Text style={styles.title}>إيصال دفع</Text>
        <Text style={styles.subtitle}>رقم الإيصال: {data.receiptNo}</Text>

        <Line label="الطالب" value={data.studentName} />
        {data.gradeLabel ? (
          <Line
            label="الصف / الشعبة"
            value={[data.gradeLabel, data.sectionName].filter(Boolean).join(' - ')}
          />
        ) : null}
        <Line label="الحساب" value={data.accountName} />
        <Line label="التاريخ" value={data.date} />
        {data.runningBalance !== undefined ? (
          <Line label="الرصيد المتبقي" value={data.runningBalance} />
        ) : null}

        <View style={styles.amountBox}>
          <Text style={styles.label}>المبلغ المدفوع</Text>
          <Text style={styles.amount}>{data.amount}</Text>
        </View>
      </Page>
    </Document>
  );
}

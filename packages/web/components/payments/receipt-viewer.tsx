'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Button, Card, CardContent } from '@erp/ui';
import { ReceiptDocument, type ReceiptData } from '../../pdf/receipt.js';

// @react-pdf PDFViewer is browser-only — load it client-side to avoid SSR issues.
const PDFViewer = dynamic(
  () => import('@react-pdf/renderer').then((m) => m.PDFViewer),
  { ssr: false, loading: () => <p className="text-sm text-gray-400">جارٍ تجهيز الإيصال…</p> },
);

/** Renders the receipt as an inline PDF, with an HTML print-friendly fallback. */
export function ReceiptViewer({ data }: { data: ReceiptData }) {
  const [mode, setMode] = useState<'pdf' | 'html'>('pdf');

  return (
    <div dir="rtl" className="space-y-4">
      <div className="flex gap-2">
        <Button
          type="button"
          variant={mode === 'pdf' ? 'primary' : 'outline'}
          onClick={() => setMode('pdf')}
        >
          PDF
        </Button>
        <Button
          type="button"
          variant={mode === 'html' ? 'primary' : 'outline'}
          onClick={() => setMode('html')}
        >
          نسخة للطباعة
        </Button>
      </div>

      {mode === 'pdf' ? (
        <div className="h-[600px] w-full max-w-xl overflow-hidden rounded-md border">
          <PDFViewer width="100%" height="100%" showToolbar>
            <ReceiptDocument data={data} />
          </PDFViewer>
        </div>
      ) : (
        <Card className="max-w-md">
          <CardContent className="space-y-2 pt-6 text-sm">
            <h2 className="text-center text-lg font-bold">إيصال دفع</h2>
            <p className="text-center text-gray-500">رقم الإيصال: {data.receiptNo}</p>
            <Row label="الطالب" value={data.studentName} />
            {data.gradeLabel ? (
              <Row
                label="الصف / الشعبة"
                value={[data.gradeLabel, data.sectionName].filter(Boolean).join(' - ')}
              />
            ) : null}
            <Row label="الحساب" value={data.accountName} />
            <Row label="التاريخ" value={data.date} />
            {data.runningBalance ? <Row label="الرصيد المتبقي" value={data.runningBalance} /> : null}
            <div className="mt-3 rounded-md bg-emerald-50 p-3 text-center">
              <span className="text-gray-500">المبلغ المدفوع</span>
              <div className="text-lg font-bold">{data.amount}</div>
            </div>
            <Button type="button" className="mt-3 w-full" onClick={() => window.print()}>
              طباعة
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-gray-100 py-1">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

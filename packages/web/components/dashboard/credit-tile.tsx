import { Card, CardContent } from '@erp/ui';
import { cn } from '@erp/ui';

/**
 * SMS-credit-remaining tile with a low-credit indicator (US6, T107).
 * Presentational only — the balance is derived server-side (sms_credit_balance,
 * surfaced through dashboard_kpis; Article II).
 */
export function CreditTile({
  remaining,
  lowThreshold = 20,
}: {
  remaining: number;
  lowThreshold?: number;
}) {
  const isLow = remaining <= lowThreshold;

  return (
    <Card className={cn(isLow && 'border-amber-300')}>
      <CardContent className="space-y-1 pt-6">
        <p className="text-sm text-gray-500">رصيد الرسائل النصية</p>
        <p className={cn('text-2xl font-bold', isLow ? 'text-amber-700' : 'text-gray-900')}>
          {remaining.toLocaleString('ar')}
        </p>
        {isLow && (
          <p className="text-xs font-medium text-amber-700">
            الرصيد منخفض — يرجى الشحن لتفادي توقف الإرسال
          </p>
        )}
      </CardContent>
    </Card>
  );
}

'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, CardHeader, CardTitle, CardContent } from '@erp/ui';
import { uploadSchoolLogoAction, removeSchoolLogoAction } from '../../lib/actions/branding.js';

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 2 * 1024 * 1024;

export function SchoolLogoForm({ currentLogoUrl }: { currentLogoUrl: string | null }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const file = e.target.files?.[0];
    if (!file) {
      setPreview(null);
      return;
    }
    if (!ALLOWED.includes(file.type)) {
      setError('نوع الصورة غير مدعوم (jpg, png, webp فقط)');
      e.target.value = '';
      setPreview(null);
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('حجم الصورة يتجاوز 2 ميجابايت');
      e.target.value = '';
      setPreview(null);
      return;
    }
    setPreview(URL.createObjectURL(file));
  }

  function onSubmit() {
    const file = inputRef.current?.files?.[0];
    if (!file) {
      setError('اختر صورة أولاً');
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set('logo', file);
        await uploadSchoolLogoAction(formData);
        setPreview(null);
        if (inputRef.current) inputRef.current.value = '';
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'حدث خطأ');
      }
    });
  }

  function onRemove() {
    setError(null);
    startTransition(async () => {
      try {
        await removeSchoolLogoAction();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'حدث خطأ');
      }
    });
  }

  const displayUrl = preview ?? currentLogoUrl;

  return (
    <Card>
      <CardHeader>
        <CardTitle>شعار المدرسة</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
            {displayUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={displayUrl} alt="شعار المدرسة" className="h-full w-full object-contain" />
            ) : (
              <span className="text-xs text-muted-foreground">لا يوجد شعار</span>
            )}
          </div>
          <div className="space-y-2">
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={onFileChange}
              className="block text-sm text-gray-700 file:me-3 file:rounded-md file:border file:border-border file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-muted"
            />
            <p className="text-xs text-muted-foreground">JPG, PNG أو WebP — بحد أقصى 2 ميجابايت</p>
          </div>
        </div>

        {error ? <p className="text-sm text-danger">{error}</p> : null}

        <div className="flex gap-2">
          <Button type="button" onClick={onSubmit} disabled={pending}>
            {pending ? 'جارٍ الحفظ…' : 'حفظ الشعار'}
          </Button>
          {currentLogoUrl ? (
            <Button type="button" variant="outline" onClick={onRemove} disabled={pending}>
              إزالة الشعار
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

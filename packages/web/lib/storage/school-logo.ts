import { createSupabaseServerClient } from '../supabase/server.js';
import { requireRole } from '../auth/guard.js';

/**
 * School logo upload (settings/branding). Same shape as
 * lib/storage/attachments.ts, but the bucket is public (a logo is branding,
 * not financial/sensitive data) and the object is mutable — re-uploading
 * replaces the same key (`upsert: true`), unlike money-attachments' immutable
 * append-only keys.
 */

export const ALLOWED_LOGO_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const MAX_LOGO_BYTES = 2 * 1024 * 1024; // ~2 MB
export const LOGO_BUCKET = 'school-logos';

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export function validateLogo(contentType: string, size: number): void {
  if (!ALLOWED_LOGO_MIME.includes(contentType as (typeof ALLOWED_LOGO_MIME)[number])) {
    throw new Error('نوع الصورة غير مدعوم (jpg, png, webp فقط)');
  }
  if (size > MAX_LOGO_BYTES) {
    throw new Error('حجم الصورة يتجاوز 2 ميجابايت');
  }
}

/** Uploads the school's logo (replacing any existing one) and returns the storage key. */
export async function uploadSchoolLogo(input: {
  contentType: (typeof ALLOWED_LOGO_MIME)[number];
  bytes: ArrayBuffer;
}): Promise<string> {
  const ctx = await requireRole('school_admin');
  if (!ctx.schoolId) throw new Error('no school context');
  validateLogo(input.contentType, input.bytes.byteLength);

  const ext = EXT[input.contentType];
  const key = `${ctx.schoolId}/logo.${ext}`;

  const supabase = createSupabaseServerClient();
  const { error } = await supabase.storage
    .from(LOGO_BUCKET)
    .upload(key, input.bytes, { contentType: input.contentType, upsert: true });
  if (error) throw new Error(error.message);
  return key;
}

/** Public URL for a stored logo key (bucket is public — no signed URL needed). */
export function schoolLogoUrl(logoPath: string | null): string | null {
  if (!logoPath) return null;
  const supabase = createSupabaseServerClient();
  return supabase.storage.from(LOGO_BUCKET).getPublicUrl(logoPath).data.publicUrl;
}

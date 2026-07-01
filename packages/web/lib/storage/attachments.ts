import { createSupabaseServerClient } from '../supabase/server.js';
import { requireAuth } from '../auth/guard.js';

/**
 * Money-event attachment upload (US3). Validates MIME + size at the boundary
 * (Article XI) and writes to the tenant-scoped path
 * `{school_id}/{event_type}/{yyyy}/{mm}/{id}-{n}.{ext}` (storage-contract). The
 * returned key is passed to the money RPC as `attachment_path`; bytes are never
 * proxied through the money function.
 */

export const ALLOWED_MIME = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024; // ~5 MB
export const ATTACHMENT_BUCKET = 'money-attachments';

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

export type AttachmentEventType = 'fee_payment' | 'expense' | 'refund';

export interface AttachmentUpload {
  contentType: (typeof ALLOWED_MIME)[number];
  bytes: ArrayBuffer;
  eventType: AttachmentEventType;
  /** Stable id (e.g. a client-generated uuid) making the key unique. */
  id: string;
  n?: number;
}

export function validateAttachment(contentType: string, size: number): void {
  if (!ALLOWED_MIME.includes(contentType as (typeof ALLOWED_MIME)[number])) {
    throw new Error('نوع الملف غير مدعوم');
  }
  if (size > MAX_ATTACHMENT_BYTES) {
    throw new Error('حجم الملف يتجاوز 5 ميجابايت');
  }
}

/** Uploads an attachment and returns the storage key to store on the event. */
export async function uploadAttachment(input: AttachmentUpload): Promise<string> {
  const ctx = await requireAuth();
  if (!ctx.schoolId) throw new Error('no school context');
  validateAttachment(input.contentType, input.bytes.byteLength);

  const now = new Date();
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const ext = EXT[input.contentType];
  const key = `${ctx.schoolId}/${input.eventType}/${yyyy}/${mm}/${input.id}-${input.n ?? 1}.${ext}`;

  const supabase = createSupabaseServerClient();
  const { error } = await supabase.storage
    .from(ATTACHMENT_BUCKET)
    .upload(key, input.bytes, { contentType: input.contentType, upsert: false });
  if (error) throw new Error(error.message);
  return key;
}

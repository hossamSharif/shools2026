import { createSupabaseServerClient } from '../supabase/server.js';

/**
 * Student photos live in the PRIVATE `student-photos` bucket (0045, FR-008a,
 * Article XVI), keyed `<school_id>/<student_id>/<file>`. Storage RLS decides
 * who may read each object (`can_read_student`, or the teacher's allocated
 * scope); this helper only asks for a short-lived signed URL with the caller's
 * own session. There is no public URL, and no service-role path.
 */
export const STUDENT_PHOTO_BUCKET = 'student-photos';
export const STUDENT_PHOTO_URL_TTL_SECONDS = 300;

/** A 5-minute signed URL for the photo, or null when there is none or RLS refuses. */
export async function signedStudentPhotoUrl(
  path: string | null | undefined,
): Promise<string | null> {
  if (!path) return null;
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.storage
    .from(STUDENT_PHOTO_BUCKET)
    .createSignedUrl(path, STUDENT_PHOTO_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

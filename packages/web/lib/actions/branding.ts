'use server';

import { revalidatePath } from 'next/cache';
import { SchoolLogoInput } from '@erp/shared/schemas';
import { createSupabaseServerClient } from '../supabase/server.js';
import { requireRole } from '../auth/guard.js';
import { uploadSchoolLogo, ALLOWED_LOGO_MIME } from '../storage/school-logo.js';

/**
 * School-branding light CRUD (settings/branding), school_admin only. Upload
 * writes the storage object then updates `school.logo_path` in the same
 * action; remove clears the column (the old object is left in the bucket —
 * upsert on next upload overwrites it, and orphan cleanup isn't worth a
 * separate job for a single small image per school).
 */

export async function uploadSchoolLogoAction(formData: FormData): Promise<void> {
  const ctx = await requireRole('school_admin');
  if (!ctx.schoolId) throw new Error('no school context');

  const file = formData.get('logo');
  if (!(file instanceof File) || file.size === 0) {
    throw new Error('اختر صورة أولاً');
  }
  if (!ALLOWED_LOGO_MIME.includes(file.type as (typeof ALLOWED_LOGO_MIME)[number])) {
    throw new Error('نوع الصورة غير مدعوم (jpg, png, webp فقط)');
  }

  const bytes = await file.arrayBuffer();
  const logoPath = await uploadSchoolLogo({
    contentType: file.type as (typeof ALLOWED_LOGO_MIME)[number],
    bytes,
  });

  const v = SchoolLogoInput.parse({ logo_path: logoPath });
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from('school')
    .update({ logo_path: v.logo_path })
    .eq('id', ctx.schoolId);
  if (error) throw new Error(error.message);

  revalidatePath('/settings/branding');
  revalidatePath('/', 'layout'); // header shows the logo
}

export async function removeSchoolLogoAction(): Promise<void> {
  const ctx = await requireRole('school_admin');
  if (!ctx.schoolId) throw new Error('no school context');

  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from('school')
    .update({ logo_path: null })
    .eq('id', ctx.schoolId);
  if (error) throw new Error(error.message);

  revalidatePath('/settings/branding');
  revalidatePath('/', 'layout');
}

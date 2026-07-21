import { requireAuth } from '../../../../lib/auth/guard.js';
import { createSupabaseServerClient } from '../../../../lib/supabase/server.js';
import { schoolLogoUrl } from '../../../../lib/storage/school-logo.js';
import { SchoolLogoForm } from '../../../../components/settings/school-logo-form.js';
import { SettingsNav } from '../../../../components/settings/settings-nav.js';

/** School branding — logo upload (school_admin only writes; RLS-enforced). */
export default async function BrandingSettingsPage() {
  const ctx = await requireAuth();
  if (!ctx.schoolId) throw new Error('no school context');
  const supabase = createSupabaseServerClient();

  const { data: school } = await supabase
    .from('school')
    .select('logo_path')
    .eq('id', ctx.schoolId)
    .maybeSingle<{ logo_path: string | null }>();

  return (
    <div dir="rtl" className="space-y-6">
      <h1 className="text-2xl font-bold">الهوية البصرية</h1>
      <SettingsNav current="/settings/branding" />
      <SchoolLogoForm currentLogoUrl={schoolLogoUrl(school?.logo_path ?? null)} />
    </div>
  );
}

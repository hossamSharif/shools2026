-- ============================================================================
-- 0027_school_logo
-- School branding: adds school.logo_path (a storage key, not a URL) and a
-- public "school-logos" bucket — public because a logo is branding, not
-- financial/sensitive data (unlike money-attachments), so the app can render
-- it via a plain public URL with no signed-URL plumbing. `school` previously
-- had super_admin ALL + a tenant-wide SELECT policy only — no tenant role
-- could ever UPDATE their own school row, so this also adds a scoped
-- school_admin UPDATE policy. Touches public.school + storage RLS ⇒ OWNER
-- REVIEW before apply (Article XII).
-- ============================================================================

alter table public.school add column if not exists logo_path text;

drop policy if exists "school_admin_update_own" on public.school;
create policy "school_admin_update_own"
on public.school for update
to authenticated
using (public.current_role() = 'school_admin' and id = public.current_school_id())
with check (public.current_role() = 'school_admin' and id = public.current_school_id());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'school-logos', 'school-logos', true,
  2097152,                                     -- ~2 MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Write access scoped to school_admin + own school (first folder segment).
-- No read policy needed: the bucket is public, so GETs bypass RLS entirely.
drop policy if exists "school_logos_admin_write" on storage.objects;
create policy "school_logos_admin_write"
on storage.objects for all to authenticated
using (
  bucket_id = 'school-logos'
  and public.current_role() = 'school_admin'
  and (storage.foldername(name))[1] = public.current_school_id()::text
)
with check (
  bucket_id = 'school-logos'
  and public.current_role() = 'school_admin'
  and (storage.foldername(name))[1] = public.current_school_id()::text
);

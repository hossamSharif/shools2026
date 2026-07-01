-- ============================================================================
-- 0014_storage_money_attachments (US3)
-- Private money-attachments bucket + tenant-scoped Storage RLS keyed to the
-- first path segment = school_id (storage-contract). Super-admin is excluded
-- (holds no school claim). OWNER REVIEW (Article XII).
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'money-attachments', 'money-attachments', false,
  5242880,                                     -- ~5 MB
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Same-school read+write; first folder segment must equal the caller's school.
drop policy if exists "money_attachments_tenant_rw" on storage.objects;
create policy "money_attachments_tenant_rw"
on storage.objects for all to authenticated
using (
  bucket_id = 'money-attachments'
  and (storage.foldername(name))[1] = public.current_school_id()::text
)
with check (
  bucket_id = 'money-attachments'
  and (storage.foldername(name))[1] = public.current_school_id()::text
);

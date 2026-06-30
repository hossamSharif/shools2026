# Storage Contract — Money-Event Attachments (Supabase Storage)

Money-event attachment images/PDFs (bank slips, cash-receipt photos, expense docs) are
stored in **Supabase Storage**; the event row persists only a **reference** (bucket
path/key), never the bytes (spec Clarification + Assumption "Attachment storage"). Access is
**tenant-scoped** like all other school data (Article IV).

## Bucket

- **Bucket name**: `money-attachments` (private; not public).
- **Accepted MIME types**: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`.
- **Max size**: ~5 MB per file, enforced at the bucket level.

## Path layout (tenant-scoped key)

```
money-attachments/{school_id}/{event_type}/{yyyy}/{mm}/{money_event_id}-{n}.{ext}
```
- `{school_id}` is the **first path segment** so RLS/storage policies can authorize on it.
- `{event_type}` ∈ `fee_payment | expense | refund` (the event kinds that carry attachments).
- `{money_event_id}-{n}` keeps the key stable and unique; the same value (the full key after
  the bucket name) is what the money event row stores in `attachment_path`.

## Access rule (tenant isolation)

A storage object is readable/writable **only** by users whose resolved `school_id` equals the
first path segment of the object key. Implemented as a Supabase Storage RLS policy on
`storage.objects` for this bucket:

```sql
-- default-deny; allow only same-school access (read + write)
create policy "money_attachments_tenant_rw"
on storage.objects for all
to authenticated
using (
  bucket_id = 'money-attachments'
  and (storage.foldername(name))[1] = (auth.jwt() ->> 'school_id')   -- school resolved server-side
)
with check (
  bucket_id = 'money-attachments'
  and (storage.foldername(name))[1] = (auth.jwt() ->> 'school_id')
);
```
- **Super-admin is excluded** from this bucket (it holds school financial documents) —
  Article IV. The policy keys strictly to the school claim; the super-admin has none.
- Uploads happen from `@erp/web` (validated: MIME + size with Zod/file checks at the
  boundary) to a path whose first segment is the user's own `school_id`; the returned key is
  passed to the money RPC as `attachment_path`. The bytes are never proxied through the money
  function.

## Lifecycle

- Attachments of **posted (immutable) financial events are never deleted** (Article III) —
  the object persists for the life of the record.
- A reversing entry references the same original event; no attachment is mutated.

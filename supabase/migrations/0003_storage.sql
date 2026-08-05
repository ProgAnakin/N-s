-- =====================================================================
-- Nós — Storage
--
-- One private bucket. Every object lives under a folder named after the
-- couple's id:
--
--     <couple_id>/memories/<uuid>.jpg
--     <couple_id>/trips/<uuid>.pdf
--     <couple_id>/phrases/<uuid>.m4a
--     <couple_id>/avatars/<uuid>.jpg
--
-- The policies below check that first path segment against the caller's own
-- couple, which is the same rule the tables use. The bucket is private, so
-- the app hands out short-lived signed URLs at render time — boarding passes
-- and photographs of the two of them should not sit on a guessable public
-- address forever.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'media',
  'media',
  false,
  10485760, -- 10 MB: enough for a photo or a boarding pass, not a video dump
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/avif', 'image/gif',
    'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/ogg', 'audio/wav', 'audio/webm',
    'application/pdf'
  ]
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists media_select on storage.objects;
create policy media_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = public.current_couple_id()::text
  );

drop policy if exists media_insert on storage.objects;
create policy media_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = public.current_couple_id()::text
  );

drop policy if exists media_update on storage.objects;
create policy media_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = public.current_couple_id()::text
  )
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = public.current_couple_id()::text
  );

drop policy if exists media_delete on storage.objects;
create policy media_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = public.current_couple_id()::text
  );

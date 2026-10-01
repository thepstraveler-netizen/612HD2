-- Phase 2: Storage buckets and the media library.
--
-- media          public bucket for catalog/CMS images (served via next/image)
-- documents      private: vendor KYC, agreements (phase 9)
-- prescriptions  private: medicine prescriptions (phase 7)

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('media', 'media', true, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'video/mp4']),
  ('documents', 'documents', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']),
  ('prescriptions', 'prescriptions', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- media bucket: anyone can read; CMS editors upload and delete.
create policy "media is publicly readable" on storage.objects
  for select to anon, authenticated using (bucket_id = 'media');
create policy "cms editors upload media" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'media' and (public.has_permission('cms.write') or public.has_permission('offers.write')));
create policy "cms editors update media" on storage.objects
  for update to authenticated
  using (bucket_id = 'media' and public.has_permission('cms.write'));
create policy "cms editors delete media" on storage.objects
  for delete to authenticated
  using (bucket_id = 'media' and public.has_permission('cms.write'));

-- Private buckets: a user's files live under "<user id>/…"; staff with the
-- relevant module permission can read them. Served only via signed URLs.
create policy "owners read own documents" on storage.objects
  for select to authenticated
  using (
    bucket_id in ('documents', 'prescriptions')
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (bucket_id = 'documents' and public.has_permission('vendors.read'))
      or (bucket_id = 'prescriptions' and public.has_permission('medicine.read'))
    )
  );
create policy "owners upload own documents" on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('documents', 'prescriptions')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Media library: metadata, alt text and reuse across the catalog.
create table public.media (
  id          uuid primary key default gen_random_uuid(),
  bucket      text not null default 'media' check (bucket = 'media'),
  path        text not null unique,
  alt         jsonb not null default '{"en": ""}'::jsonb,
  mime_type   text not null,
  size_bytes  integer not null check (size_bytes > 0),
  width       integer,
  height      integer,
  collection  text not null default 'general',
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index media_collection_idx on public.media (collection, created_at desc);

create trigger media_set_updated_at before update on public.media
  for each row execute function public.set_updated_at();

alter table public.media enable row level security;

create policy "media metadata is public" on public.media
  for select to anon, authenticated using (deleted_at is null or public.has_permission('cms.read'));
create policy "content editors manage media" on public.media
  for all to authenticated
  using (public.has_permission('cms.write') or public.has_permission('offers.write'))
  with check (public.has_permission('cms.write') or public.has_permission('offers.write'));

select public.enable_audit('public.media');

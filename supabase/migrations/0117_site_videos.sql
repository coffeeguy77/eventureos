-- 0117: a public "videos" bucket for website videos (e.g. the shop hero), uploaded straight from the browser.
-- Same rules as "branding": files live under <organisation id>/…, owners and admins upload and delete, anyone can view.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('videos', 'videos', true, 52428800, array['video/mp4', 'video/webm', 'video/quicktime'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "videos: owner/admin upload" on storage.objects;
create policy "videos: owner/admin upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'videos' and public.has_org_role(public.try_uuid((storage.foldername(name))[1]), array['owner'::public.org_role, 'admin'::public.org_role]));

drop policy if exists "videos: owner/admin update" on storage.objects;
create policy "videos: owner/admin update" on storage.objects for update to authenticated
  using (bucket_id = 'videos' and public.has_org_role(public.try_uuid((storage.foldername(name))[1]), array['owner'::public.org_role, 'admin'::public.org_role]))
  with check (bucket_id = 'videos' and public.has_org_role(public.try_uuid((storage.foldername(name))[1]), array['owner'::public.org_role, 'admin'::public.org_role]));

drop policy if exists "videos: owner/admin delete" on storage.objects;
create policy "videos: owner/admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'videos' and public.has_org_role(public.try_uuid((storage.foldername(name))[1]), array['owner'::public.org_role, 'admin'::public.org_role]));

drop policy if exists "videos: staff list own org" on storage.objects;
create policy "videos: staff list own org" on storage.objects for select to authenticated
  using (bucket_id = 'videos' and public.is_org_staff(public.try_uuid((storage.foldername(name))[1])));

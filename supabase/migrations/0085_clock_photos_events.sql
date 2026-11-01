-- =====================================================================
-- EventureOS 0085 — clocking on: a photo from the café iPad, and clocking on for event shifts in the staff app
--   staff_time_entries.in_photo / out_photo : storage paths in the private clock-photos bucket
--   staff_time_entries.event_crew_id        : the event shift someone clocked on for (recorded with their location;
--                                             event pay still comes from the job, not from these times)
-- =====================================================================

alter table public.staff_time_entries add column if not exists in_photo text;
alter table public.staff_time_entries add column if not exists out_photo text;
alter table public.staff_time_entries add column if not exists event_crew_id uuid references public.event_crew(id) on delete set null;
create index if not exists staff_time_entries_event_crew on public.staff_time_entries (event_crew_id) where event_crew_id is not null;

-- photos: private; the server saves them, the office reads them through short-lived links
insert into storage.buckets (id, name, public, file_size_limit)
values ('clock-photos', 'clock-photos', false, 2097152)
on conflict (id) do update set file_size_limit = excluded.file_size_limit;
drop policy if exists "clock-photos: managers read" on storage.objects;
create policy "clock-photos: managers read" on storage.objects for select to authenticated
  using (bucket_id = 'clock-photos' and public.is_org_manager(public.try_uuid((storage.foldername(name))[1])));

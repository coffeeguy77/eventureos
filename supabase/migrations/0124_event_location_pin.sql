-- 0124: where the job is, confirmed by the customer when they accept the quote.
-- events.address (already there) holds the address they picked, or the nearest address to a pin they dropped.
-- A dropped pin (e.g. a coffee van in a park) also keeps its exact spot, and the calendar location uses it.
alter table public.events
  add column if not exists location_lat double precision,
  add column if not exists location_lng double precision,
  add column if not exists location_pinned boolean not null default false,
  add column if not exists location_note text;

alter table public.events drop constraint if exists events_location_lat_check;
alter table public.events add constraint events_location_lat_check check (location_lat is null or location_lat between -90 and 90);
alter table public.events drop constraint if exists events_location_lng_check;
alter table public.events add constraint events_location_lng_check check (location_lng is null or location_lng between -180 and 180);
alter table public.events drop constraint if exists events_location_note_len;
alter table public.events add constraint events_location_note_len check (location_note is null or char_length(location_note) <= 500);

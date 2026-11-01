-- =====================================================================
-- EventureOS 0091 — appointments: client meetings booked by the office or by the client on the website
--   appointments                    : who, when, how (video / phone / in person), status, the client's suggested new time
--   calendar_events.appointment_id  : the calendar entry for an appointment (and Google Calendar, when connected)
-- Booking a new client starts them in the CRM (a client, their contact and an enquiry) and opens their portal.
-- Clients use a private link (token) to confirm, suggest another time or cancel.
-- =====================================================================

create table if not exists public.appointments (
  id                 uuid primary key default gen_random_uuid(),
  organisation_id    uuid not null references public.organisations(id) on delete cascade,
  customer_id        uuid,
  contact_id         uuid,
  enquiry_id         uuid,
  title              text not null check (char_length(title) between 1 and 200),
  kind               text not null default 'video' check (kind in ('video', 'phone', 'in_person')),
  location           text,
  meeting_url        text,
  starts_at          timestamptz not null,
  ends_at            timestamptz not null check (ends_at > starts_at),
  status             text not null default 'confirmed' check (status in ('pending', 'confirmed', 'reschedule_requested', 'declined', 'cancelled', 'completed')),
  proposed_starts_at timestamptz,
  proposed_ends_at   timestamptz,
  client_name        text,
  client_email       text,
  client_phone       text,
  client_company     text,
  client_note        text,
  notes              text,
  token              text not null unique default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  source             text not null default 'office' check (source in ('office', 'website')),
  assigned_to        uuid references public.users(id) on delete set null,
  calendar_event_id  uuid,
  reminder_sent_at   timestamptz,
  created_by         uuid references public.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (id, organisation_id),
  foreign key (customer_id, organisation_id) references public.customers(id, organisation_id) on delete set null (customer_id),
  foreign key (contact_id, organisation_id) references public.contacts(id, organisation_id) on delete set null (contact_id),
  foreign key (enquiry_id, organisation_id) references public.enquiries(id, organisation_id) on delete set null (enquiry_id)
);
create index if not exists appointments_when on public.appointments (organisation_id, starts_at);
create index if not exists appointments_customer on public.appointments (organisation_id, customer_id);

alter table public.calendar_events add column if not exists appointment_id uuid references public.appointments(id) on delete cascade;
alter table public.calendar_events drop constraint if exists calendar_events_kind_check;
alter table public.calendar_events add constraint calendar_events_kind_check
  check (kind in ('event','site_visit','setup','hold','other','task','shift','meeting'));

alter table public.appointments enable row level security;
drop policy if exists appointments_staff on public.appointments;
create policy appointments_staff on public.appointments for all to authenticated
  using (public.is_org_staff(organisation_id)) with check (public.is_org_staff(organisation_id));
-- clients see their own appointments in the portal
drop policy if exists appointments_portal_select on public.appointments;
create policy appointments_portal_select on public.appointments for select to authenticated
  using (customer_id in (select public.portal_customer_ids()));

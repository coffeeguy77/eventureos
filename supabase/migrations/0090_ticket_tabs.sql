-- =====================================================================
-- EventureOS 0090 — tickets from enquiries, and tabs on a ticket (one per issue, each with its own person)
--   support_tickets.contact_id / enquiry_id : who at the client asked, and the enquiry it came from
--   enquiries.ticket_id                     : the ticket an enquiry became (or was added to)
--   support_ticket_tabs                     : e.g. Domain / Hosting / Updates — each assigned to someone, open or done
--   support_ticket_updates.tab_id           : which tab a note or reply belongs to
-- =====================================================================

alter table public.support_tickets add column if not exists contact_id uuid;
alter table public.support_tickets add column if not exists enquiry_id uuid;
do $$ begin
  alter table public.support_tickets add constraint support_tickets_contact_fk foreign key (contact_id, organisation_id) references public.contacts(id, organisation_id) on delete set null (contact_id);
exception when duplicate_object then null; end $$;
alter table public.enquiries add column if not exists ticket_id uuid;
do $$ begin
  alter table public.enquiries add constraint enquiries_ticket_fk foreign key (ticket_id, organisation_id) references public.support_tickets(id, organisation_id) on delete set null (ticket_id);
exception when duplicate_object then null; end $$;

create table if not exists public.support_ticket_tabs (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  ticket_id       uuid not null,
  name            text not null check (char_length(name) between 1 and 60),
  assigned_to     uuid references public.users(id) on delete set null,
  done            boolean not null default false,
  done_at         timestamptz,
  position        integer not null default 0,
  created_at      timestamptz not null default now(),
  foreign key (ticket_id, organisation_id) references public.support_tickets(id, organisation_id) on delete cascade
);
create index if not exists support_ticket_tabs_ticket on public.support_ticket_tabs (ticket_id, position);
create index if not exists support_ticket_tabs_assignee on public.support_ticket_tabs (organisation_id, assigned_to) where not done;

alter table public.support_ticket_updates add column if not exists tab_id uuid references public.support_ticket_tabs(id) on delete set null;

-- same access as tickets: the office team (not staff-app users or customers)
alter table public.support_ticket_tabs enable row level security;
drop policy if exists "support_ticket_tabs: team" on public.support_ticket_tabs;
create policy "support_ticket_tabs: team" on public.support_ticket_tabs for all to authenticated
  using (public.is_org_staff(organisation_id)) with check (public.is_org_staff(organisation_id));

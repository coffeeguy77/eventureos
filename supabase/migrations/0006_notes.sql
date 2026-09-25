-- Internal notes on customers, enquiries and events
create table public.notes (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  body            text not null check (length(trim(body)) > 0),
  customer_id     uuid,
  event_id        uuid,
  enquiry_id      uuid,
  pinned          boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references public.users(id) default auth.uid(),
  foreign key (customer_id, organisation_id) references public.customers(id, organisation_id) on delete cascade,
  foreign key (event_id, organisation_id)    references public.events(id, organisation_id) on delete cascade,
  foreign key (enquiry_id, organisation_id)  references public.enquiries(id, organisation_id) on delete cascade
);
create index on public.notes (organisation_id, created_at desc);
create trigger notes_updated_at before update on public.notes for each row execute function public.set_updated_at();

alter table public.notes enable row level security;
create policy notes_select on public.notes for select to authenticated using (public.is_org_staff(organisation_id));
create policy notes_insert on public.notes for insert to authenticated
  with check (public.is_org_staff(organisation_id) and created_by = auth.uid());
create policy notes_update on public.notes for update to authenticated
  using (public.is_org_staff(organisation_id) and created_by = auth.uid())
  with check (public.is_org_staff(organisation_id));
create policy notes_delete on public.notes for delete to authenticated
  using (created_by = auth.uid() or public.is_org_manager(organisation_id));

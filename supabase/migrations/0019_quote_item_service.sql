-- Which price-list service a quote line came from (for Xero item code / account when invoicing).
alter table public.quote_items add column if not exists service_id uuid;
do $$ begin
  alter table public.quote_items add constraint quote_items_service_fk
    foreign key (service_id, organisation_id) references public.services(id, organisation_id) on delete set null (service_id);
exception when duplicate_object then null; end $$;

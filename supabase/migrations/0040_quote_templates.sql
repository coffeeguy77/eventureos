-- Quote templates: a named starting point (e.g. "Coffee cart 3 hr — delivered") made of price-list items
-- and quantities, added to a quote in one click. Prices always come from the price list at the time of use.
create table if not exists public.quote_templates (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  name            text not null check (char_length(name) between 1 and 120),
  summary         text check (char_length(summary) <= 300),
  -- [{ "title": "Coffee cart", "items": [{ "service_id": "…", "quantity": 3, "description": "optional override", "optional": false }] }]
  sections        jsonb not null default '[]'::jsonb check (jsonb_typeof(sections) = 'array'),
  active          boolean not null default true,
  position        integer not null default 0,
  created_by      uuid references public.users(id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists quote_templates_org_idx on public.quote_templates (organisation_id, active, position);
drop trigger if exists quote_templates_updated_at on public.quote_templates;
create trigger quote_templates_updated_at before update on public.quote_templates for each row execute function public.set_updated_at();

alter table public.quote_templates enable row level security;
drop policy if exists quote_templates_select on public.quote_templates;
create policy quote_templates_select on public.quote_templates for select to authenticated using (public.is_org_staff(organisation_id));
drop policy if exists quote_templates_write on public.quote_templates;
create policy quote_templates_write on public.quote_templates for all to authenticated
  using (public.is_org_manager(organisation_id)) with check (public.is_org_manager(organisation_id));

-- Line helpers: how a line's quantity was worked out, so it can be edited the same way later.
--   staff line:  { "kind": "staff", "start": "08:00", "end": "11:00", "staff": 1, "setup_minutes": 30 }
--   drinks line: { "kind": "serves", "hot": 200, "cold": 50 }
alter table public.quote_items add column if not exists details jsonb check (details is null or jsonb_typeof(details) = 'object');

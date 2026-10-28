-- 0076 — Nerd Herd: IT support for web agencies (Web Culture first).
--   1. Invoice numbers can carry the business's own prefix (organisations.settings.invoice_prefix, default "INV-").
--   2. websites            — each client's sites (joined to their hosting account and maintenance plan)
--      support_tickets     — jobs: support requests, maintenance runs, projects (numbered per business)
--      support_ticket_updates — the conversation and time log on a ticket (public lines show in the client portal)
--   3. Maintenance plans are recurring invoices with creates_ticket on. Each time one is raised a maintenance ticket
--      is opened; with work_after_payment on it waits as "awaiting payment" and moves to "open" the moment the
--      invoice is paid (paid here, by card, or in Xero — the Xero sync marks it paid).
--   4. Two businesses can share one Xero file (same ABN, a trading name): the second business's Xero connection
--      borrows the first one's tokens, but only when the first business lists it in settings.shared_with.
-- Additive only: new tables, columns, functions, triggers and policies. Safe to run more than once.

-- 1. Invoice prefix -------------------------------------------------------------------------------------------
create or replace function public.assign_org_number()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_prefix text;
begin
  if TG_TABLE_NAME = 'invoices' then
    if new.number is null then
      select coalesce(o.settings->>'invoice_prefix', 'INV-') into v_prefix from public.organisations o where o.id = new.organisation_id;
      new.number := coalesce(v_prefix, 'INV-') || public.next_org_number(new.organisation_id, 'invoice', 1001)::text;
    end if;
  elsif new.number is null then
    new.number := public.next_org_number(
      new.organisation_id, TG_TABLE_NAME,
      case TG_TABLE_NAME when 'enquiries' then 1001 when 'events' then 2001 when 'quotes' then 1001 when 'support_tickets' then 1001 else 1 end);
  end if;
  return new;
end $$;

-- 2. Websites -----------------------------------------------------------------------------------------------------
create table if not exists public.websites (
  id                 uuid primary key default gen_random_uuid(),
  organisation_id    uuid not null references public.organisations(id) on delete cascade,
  customer_id        uuid,
  domain             text not null,
  name               text,
  platform           text not null default 'wordpress',     -- wordpress | shopify | woocommerce | squarespace | custom | other
  status             text not null default 'live' check (status in ('live','building','paused','archived')),
  hosting_account_id uuid references public.hosting_accounts(id) on delete set null,
  admin_url          text,
  launched_on        date,
  notes              text,
  created_by         uuid references public.users(id) default auth.uid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (id, organisation_id),
  foreign key (customer_id, organisation_id) references public.customers(id, organisation_id)
);
create unique index if not exists websites_domain on public.websites (organisation_id, lower(domain));
create index if not exists websites_customer on public.websites (organisation_id, customer_id);

-- 3. Tickets ------------------------------------------------------------------------------------------------------
create table if not exists public.support_tickets (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  number           integer,
  customer_id      uuid,
  website_id       uuid,
  subject          text not null,
  description      text,
  status           text not null default 'new' check (status in ('new','open','awaiting_payment','waiting_customer','scheduled','in_progress','resolved','closed')),
  priority         text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  kind             text not null default 'support' check (kind in ('support','maintenance','project','hosting','billing','other')),
  source           text not null default 'manual' check (source in ('manual','email','portal','maintenance','repairshopr')),
  assigned_to      uuid references public.users(id) on delete set null,
  email_thread_id  uuid references public.email_threads(id) on delete set null,
  invoice_id       uuid references public.invoices(id) on delete set null,      -- maintenance: the invoice that pays for it
  recurring_id     uuid references public.recurring_invoices(id) on delete set null,
  due_date         date,
  checklist        jsonb not null default '[]'::jsonb,                           -- [{ "label": "...", "done": false }]
  external_ref     text,                                                          -- e.g. RepairShopr #4201
  resolved_at      timestamptz,
  last_activity_at timestamptz not null default now(),
  created_by       uuid references public.users(id) default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (id, organisation_id),
  foreign key (customer_id, organisation_id) references public.customers(id, organisation_id),
  foreign key (website_id, organisation_id) references public.websites(id, organisation_id)
);
create unique index if not exists support_tickets_number on public.support_tickets (organisation_id, number);
create index if not exists support_tickets_open on public.support_tickets (organisation_id, status, last_activity_at desc);
create index if not exists support_tickets_customer on public.support_tickets (organisation_id, customer_id);
create index if not exists support_tickets_invoice on public.support_tickets (invoice_id) where invoice_id is not null;
create index if not exists support_tickets_thread on public.support_tickets (email_thread_id) where email_thread_id is not null;
drop trigger if exists support_tickets_number on public.support_tickets;
create trigger support_tickets_number before insert on public.support_tickets for each row execute function public.assign_org_number();

create table if not exists public.support_ticket_updates (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  ticket_id        uuid not null,
  kind             text not null default 'comment' check (kind in ('comment','note','email_in','email_out','status','time','system')),
  body             text,
  minutes          integer check (minutes is null or minutes between 0 and 100000),
  billable         boolean not null default true,
  billed_invoice_id uuid references public.invoices(id) on delete set null,
  public           boolean not null default false,                                -- shown to the client in their portal
  author_id        uuid references public.users(id) default auth.uid(),
  author_name      text,
  email_message_id uuid references public.email_messages(id) on delete set null,
  created_at       timestamptz not null default now(),
  foreign key (ticket_id, organisation_id) references public.support_tickets(id, organisation_id) on delete cascade
);
create index if not exists support_ticket_updates_ticket on public.support_ticket_updates (ticket_id, created_at);
create unique index if not exists support_ticket_updates_email on public.support_ticket_updates (email_message_id) where email_message_id is not null;

-- 4. Maintenance plans on recurring invoices -----------------------------------------------------------------
alter table public.recurring_invoices add column if not exists creates_ticket     boolean not null default false;
alter table public.recurring_invoices add column if not exists work_after_payment boolean not null default true;
alter table public.recurring_invoices add column if not exists website_id         uuid references public.websites(id) on delete set null;
alter table public.recurring_invoices add column if not exists ticket_checklist   jsonb;

create or replace function public.nh_default_checklist()
returns jsonb language sql immutable set search_path = '' as $$
  select '[{"label":"Full backup taken before updates","done":false},
           {"label":"CMS core updated","done":false},
           {"label":"Plugins and theme updated","done":false},
           {"label":"Malware and security scan","done":false},
           {"label":"Site checked on desktop and mobile after updates","done":false},
           {"label":"Forms tested","done":false}]'::jsonb;
$$;

-- An invoice raised from a maintenance plan opens its maintenance ticket.
create or replace function public.nh_ticket_for_invoice()
returns trigger language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  select * into r from public.recurring_invoices where id = new.recurring_id;
  if r.id is null or not r.creates_ticket then return new; end if;
  if exists (select 1 from public.support_tickets t where t.invoice_id = new.id) then return new; end if;
  insert into public.support_tickets (organisation_id, customer_id, website_id, subject, status, kind, source, invoice_id, recurring_id, due_date, checklist, created_by)
  values (new.organisation_id, new.customer_id, r.website_id,
          left(r.name || ' — ' || to_char(new.issue_date, 'FMMonth YYYY'), 300),
          case when r.work_after_payment and new.status::text not in ('paid') then 'awaiting_payment' else 'open' end,
          'maintenance', 'maintenance', new.id, r.id, new.issue_date + 14,
          coalesce(r.ticket_checklist, public.nh_default_checklist()), null);
  return new;
end $$;
drop trigger if exists invoices_nh_ticket on public.invoices;
create trigger invoices_nh_ticket after insert on public.invoices for each row when (new.recurring_id is not null) execute function public.nh_ticket_for_invoice();

-- Paid → the work can start.
create or replace function public.nh_ticket_paid()
returns trigger language plpgsql security definer set search_path = '' as $$
declare t record;
begin
  for t in select id, organisation_id, number, subject from public.support_tickets where invoice_id = new.id and status = 'awaiting_payment' loop
    update public.support_tickets set status = 'open', last_activity_at = now(), updated_at = now() where id = t.id;
    insert into public.support_ticket_updates (organisation_id, ticket_id, kind, body, author_id, author_name)
    values (t.organisation_id, t.id, 'system', 'Invoice ' || coalesce(new.number, '') || ' paid — ready to do.', null, 'Nerd Herd');
    insert into public.notifications (organisation_id, type, title, body, link, entity_type, entity_id)
    values (t.organisation_id, 'ticket.paid', left('Paid — ready to do: #' || t.number || ' ' || t.subject, 200),
            'Invoice ' || coalesce(new.number, '') || ' has been paid.', '/nerd-herd/tickets/' || t.id, 'support_ticket', t.id);
  end loop;
  return new;
end $$;
drop trigger if exists invoices_nh_paid on public.invoices;
create trigger invoices_nh_paid after update of status on public.invoices for each row
  when (new.status = 'paid' and old.status is distinct from 'paid') execute function public.nh_ticket_paid();

revoke all on function public.nh_ticket_for_invoice() from public, anon, authenticated;
revoke all on function public.nh_ticket_paid() from public, anon, authenticated;

-- 5. Security -------------------------------------------------------------------------------------------------
alter table public.websites enable row level security;
alter table public.support_tickets enable row level security;
alter table public.support_ticket_updates enable row level security;

do $$ declare t text; begin
  foreach t in array array['websites','support_tickets','support_ticket_updates'] loop
    execute format('drop policy if exists %1$s_staff_select on public.%1$s', t);
    execute format('create policy %1$s_staff_select on public.%1$s for select to authenticated using (public.is_org_staff(organisation_id))', t);
    execute format('drop policy if exists %1$s_staff_insert on public.%1$s', t);
    execute format('create policy %1$s_staff_insert on public.%1$s for insert to authenticated with check (public.is_org_staff(organisation_id))', t);
    execute format('drop policy if exists %1$s_staff_update on public.%1$s', t);
    execute format('create policy %1$s_staff_update on public.%1$s for update to authenticated using (public.is_org_staff(organisation_id)) with check (public.is_org_staff(organisation_id))', t);
    execute format('drop policy if exists %1$s_manager_delete on public.%1$s', t);
    execute format('create policy %1$s_manager_delete on public.%1$s for delete to authenticated using (public.is_org_manager(organisation_id))', t);
  end loop;
end $$;

-- Clients see their own sites, tickets and the public lines on them in the portal.
drop policy if exists websites_portal_select on public.websites;
create policy websites_portal_select on public.websites for select to authenticated
  using (customer_id in (select public.portal_customer_ids()) and status <> 'archived');
drop policy if exists support_tickets_portal_select on public.support_tickets;
create policy support_tickets_portal_select on public.support_tickets for select to authenticated
  using (customer_id in (select public.portal_customer_ids()));
drop policy if exists support_ticket_updates_portal_select on public.support_ticket_updates;
create policy support_ticket_updates_portal_select on public.support_ticket_updates for select to authenticated
  using (public and ticket_id in (select t.id from public.support_tickets t where t.customer_id in (select public.portal_customer_ids())));

-- A client raises a ticket (or replies on one) from their portal.
create or replace function public.portal_raise_ticket(p_customer uuid, p_subject text, p_body text, p_website uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_id uuid; v_name text;
begin
  if p_customer is null or p_customer not in (select public.portal_customer_ids()) then raise exception 'Not allowed'; end if;
  if coalesce(trim(p_subject), '') = '' then raise exception 'Please say what you need help with.'; end if;
  select organisation_id into v_org from public.customers where id = p_customer;
  if p_website is not null and not exists (select 1 from public.websites w where w.id = p_website and w.customer_id = p_customer) then p_website := null; end if;
  select coalesce(u.full_name, u.email) into v_name from public.users u where u.id = auth.uid();
  insert into public.support_tickets (organisation_id, customer_id, website_id, subject, description, status, source, created_by)
  values (v_org, p_customer, p_website, left(trim(p_subject), 300), left(p_body, 20000), 'new', 'portal', null) returning id into v_id;
  insert into public.support_ticket_updates (organisation_id, ticket_id, kind, body, public, author_id, author_name)
  values (v_org, v_id, 'comment', left(coalesce(p_body, p_subject), 20000), true, auth.uid(), v_name);
  insert into public.notifications (organisation_id, type, title, body, link, entity_type, entity_id)
  values (v_org, 'ticket.new', left('New ticket from ' || coalesce(v_name, 'a client') || ': ' || p_subject, 200), left(p_body, 140), '/nerd-herd/tickets/' || v_id, 'support_ticket', v_id);
  return v_id;
end $$;

create or replace function public.portal_reply_ticket(p_ticket uuid, p_body text)
returns void language plpgsql security definer set search_path = '' as $$
declare t record; v_name text;
begin
  select * into t from public.support_tickets where id = p_ticket;
  if t.id is null or t.customer_id is null or t.customer_id not in (select public.portal_customer_ids()) then raise exception 'Not allowed'; end if;
  if coalesce(trim(p_body), '') = '' then raise exception 'Please write a message.'; end if;
  select coalesce(u.full_name, u.email) into v_name from public.users u where u.id = auth.uid();
  insert into public.support_ticket_updates (organisation_id, ticket_id, kind, body, public, author_id, author_name)
  values (t.organisation_id, t.id, 'comment', left(p_body, 20000), true, auth.uid(), v_name);
  update public.support_tickets set last_activity_at = now(), updated_at = now(),
    status = case when status in ('resolved','closed','waiting_customer') then 'open' else status end where id = t.id;
  insert into public.notifications (organisation_id, type, title, body, link, entity_type, entity_id)
  values (t.organisation_id, 'ticket.reply', left('Reply on #' || t.number || ' from ' || coalesce(v_name, 'the client'), 200), left(p_body, 140), '/nerd-herd/tickets/' || t.id, 'support_ticket', t.id);
end $$;
revoke all on function public.portal_raise_ticket(uuid, text, text, uuid) from public, anon;
revoke all on function public.portal_reply_ticket(uuid, text) from public, anon;
grant execute on function public.portal_raise_ticket(uuid, text, text, uuid) to authenticated;
grant execute on function public.portal_reply_ticket(uuid, text) to authenticated;

-- 6. One Xero file, two businesses --------------------------------------------------------------------------
-- A manager of the borrowing business may use the lending connection's tokens, but only while the lending business
-- lists the borrower in its Xero settings (settings.shared_with = [org ids]) and the borrower points back at it.
create or replace function public._integration_token_access(p_integration_id uuid, p_server_key text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid; v_shared jsonb;
begin
  select organisation_id, settings->'shared_with' into v_org, v_shared from public.integrations where id = p_integration_id;
  if v_org is null then return false; end if;
  if public.is_org_manager(v_org) then return true; end if;
  if public.is_org_staff(v_org) and p_server_key is not null and exists (
       select 1 from private.server_keys k
       where k.name = 'integration'
         and k.key_sha256 = encode(extensions.digest(convert_to(p_server_key, 'UTF8'), 'sha256'), 'hex')) then
    return true;
  end if;
  -- borrowed: the caller manages a business whose connection points here, and this connection shares with it
  if jsonb_typeof(v_shared) = 'array' and exists (
       select 1 from public.integrations b
       where b.settings->>'shared_from' = p_integration_id::text
         and v_shared ? b.organisation_id::text
         and public.is_org_manager(b.organisation_id)) then
    return true;
  end if;
  return false;
end $$;

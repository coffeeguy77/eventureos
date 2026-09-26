-- =====================================================================
-- EventureOS 0017 — Xero job history
--   invoices.reference / line_items : what was sold, as it appears in Xero
--   xero_quotes                     : quotes raised in Xero (read-only history)
-- =====================================================================

alter table public.invoices add column if not exists reference text;
alter table public.invoices add column if not exists line_items jsonb;   -- [{description, quantity, unit_amount, item_code, account_code, line_amount}]

create table public.xero_quotes (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  customer_id     uuid not null,
  xero_quote_id   text not null,
  number          text,
  reference       text,
  title           text,
  summary         text,
  status          text not null,              -- DRAFT, SENT, ACCEPTED, DECLINED, INVOICED, DELETED
  quote_date      date,
  expiry_date     date,
  subtotal        numeric(12,2) not null default 0,
  tax_total       numeric(12,2) not null default 0,
  total           numeric(12,2) not null default 0,
  currency        text,
  line_items      jsonb,
  xero_updated_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  foreign key (customer_id, organisation_id) references public.customers(id, organisation_id) on delete cascade,
  unique (organisation_id, xero_quote_id)
);
create index xero_quotes_customer_idx on public.xero_quotes (organisation_id, customer_id, quote_date desc);
create trigger xero_quotes_updated_at before update on public.xero_quotes for each row execute function public.set_updated_at();

alter table public.xero_quotes enable row level security;
create policy xero_quotes_select on public.xero_quotes for select to authenticated using (public.is_org_staff(organisation_id));
create policy xero_quotes_insert on public.xero_quotes for insert to authenticated with check (public.is_org_manager(organisation_id));
create policy xero_quotes_update on public.xero_quotes for update to authenticated using (public.is_org_manager(organisation_id)) with check (public.is_org_manager(organisation_id));
create policy xero_quotes_delete on public.xero_quotes for delete to authenticated using (public.is_org_manager(organisation_id));

-- Link email conversations and enquiries to the customer whose email address they came from.
-- Exact address matches only (customer email or one of its contacts); never overwrites an existing link.
create or replace function public.link_customer_emails(p_org uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_enq integer; v_thr integer;
begin
  if auth.uid() is not null and not public.is_org_manager(p_org) then raise exception 'Only owners, admins and managers can link emails'; end if;

  create temporary table if not exists _addr (email text primary key, customer_id uuid) on commit drop;
  truncate _addr;
  -- An address that belongs to more than one customer is ambiguous: skip it.
  insert into _addr (email, customer_id)
  select e, (array_agg(distinct cid))[1] from (
    select lower(trim(c.email)) e, c.id cid from public.customers c where c.organisation_id = p_org and coalesce(trim(c.email), '') <> ''
    union all
    select lower(trim(k.email)), k.customer_id from public.contacts k where k.organisation_id = p_org and coalesce(trim(k.email), '') <> ''
  ) x group by e having count(distinct cid) = 1;

  update public.enquiries q set customer_id = a.customer_id
  from _addr a
  where q.organisation_id = p_org and q.customer_id is null and lower(trim(q.contact_email)) = a.email;
  get diagnostics v_enq = row_count;

  update public.email_threads t set customer_id = s.customer_id
  from (
    select t2.id, (array_agg(distinct a.customer_id))[1] customer_id
    from public.email_threads t2 join _addr a on a.email = any (select lower(p) from unnest(t2.participants) p)
    where t2.organisation_id = p_org and t2.customer_id is null
    group by t2.id having count(distinct a.customer_id) = 1
  ) s
  where t.id = s.id;
  get diagnostics v_thr = row_count;

  return jsonb_build_object('enquiries', v_enq, 'threads', v_thr);
end $$;
revoke all on function public.link_customer_emails(uuid) from public, anon;
grant execute on function public.link_customer_emails(uuid) to authenticated, service_role;

-- 0120: Projects — (1) margins move to a managers-only table (per client, and an override per invoice). Until now the
-- client margin sat in organisations.settings, which a signed-in portal client can read. (2) Each portal contact gets a
-- role: 'accounts' sees hours, invoices and what's owed; 'team' sees the work and requests only — no prices or hours.
-- Every existing contact stays 'accounts', so nobody loses anything they can see today.

-- 1. Margins ---------------------------------------------------------------------------------------------------------
create table if not exists public.nh_margins (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete cascade,
  invoice_id uuid references public.invoices(id) on delete cascade,
  margin_percent numeric(6,2) not null check (margin_percent >= 0 and margin_percent <= 500),
  updated_at timestamptz not null default now(),
  constraint nh_margins_one_target check ((customer_id is null) <> (invoice_id is null))
);
create unique index if not exists nh_margins_customer on public.nh_margins (customer_id) where customer_id is not null;
create unique index if not exists nh_margins_invoice on public.nh_margins (invoice_id) where invoice_id is not null;
alter table public.nh_margins enable row level security;
drop policy if exists "nh_margins managers" on public.nh_margins;
create policy "nh_margins managers" on public.nh_margins for all to authenticated
  using (public.is_org_manager(organisation_id)) with check (public.is_org_manager(organisation_id));

insert into public.nh_margins (organisation_id, customer_id, margin_percent)
select o.id, kv.key::uuid, (kv.value #>> '{}')::numeric
from public.organisations o
cross join lateral jsonb_each(coalesce(o.settings -> 'nh_client_margins', '{}'::jsonb)) kv
where kv.key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and (kv.value #>> '{}') ~ '^[0-9]+(\.[0-9]+)?$'
  and exists (select 1 from public.customers c where c.id = kv.key::uuid and c.organisation_id = o.id)
on conflict do nothing;
update public.organisations set settings = settings - 'nh_client_margins' where settings ? 'nh_client_margins';

-- 2. Portal roles ----------------------------------------------------------------------------------------------------
alter table public.contacts add column if not exists portal_role text not null default 'accounts';
alter table public.contacts drop constraint if exists contacts_portal_role_check;
alter table public.contacts add constraint contacts_portal_role_check check (portal_role in ('accounts', 'team'));

-- The customers this signed-in person may see the money for (their 'accounts' contacts only)
create or replace function public.portal_billing_customer_ids()
 returns setof uuid language sql stable security definer set search_path to ''
as $$
  select ct.customer_id from public.contacts ct
  join public.organisation_users ou on ou.organisation_id = ct.organisation_id and ou.user_id = auth.uid()
       and ou.status = 'active' and (ou.expires_at is null or ou.expires_at > now())
  join public.organisations o on o.id = ct.organisation_id and o.status = 'active'
  where ct.portal_user_id = auth.uid() and ct.portal_role = 'accounts';
$$;

alter policy invoices_portal_select on public.invoices
  using (customer_id in (select public.portal_billing_customer_ids()) and status <> 'draft'::invoice_status);
alter policy payments_portal_select on public.payments
  using (invoice_id in (select i.id from public.invoices i where i.customer_id in (select public.portal_billing_customer_ids())));

-- Someone a client adds to a booking gets the same role as the person who added them (never more)
create or replace function public.portal_add_person(p_event_id uuid, p_first text, p_last text, p_email text, p_phone text, p_role text)
 returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare
  ev public.events%rowtype;
  v_email text := lower(trim(coalesce(p_email, '')));
  v_first text := left(trim(coalesce(p_first, '')), 100);
  v_contact uuid;
  v_by text;
  v_send boolean;
  v_access text;
begin
  select * into ev from public.events where id = p_event_id;
  if ev.id is null or ev.customer_id not in (select public.portal_customer_ids()) then raise exception 'Not allowed'; end if;
  if v_first = '' then raise exception 'Enter their first name'; end if;
  if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' then raise exception 'Enter a valid email address'; end if;
  if (select count(*) from public.event_contacts where event_id = ev.id) >= 20 then raise exception 'This booking already has 20 people — contact us to add more'; end if;

  select case when bool_or(k.portal_role = 'accounts') then 'accounts' else 'team' end into v_access
  from public.contacts k where k.portal_user_id = auth.uid() and k.customer_id = ev.customer_id;

  select id into v_contact from public.contacts where customer_id = ev.customer_id and lower(email) = v_email limit 1;
  if v_contact is null then
    insert into public.contacts (organisation_id, customer_id, first_name, last_name, email, phone, is_primary, portal_role)
    values (ev.organisation_id, ev.customer_id, v_first, nullif(left(trim(coalesce(p_last, '')), 100), ''), v_email,
            nullif(left(trim(coalesce(p_phone, '')), 40), ''), false, coalesce(v_access, 'team'))
    returning id into v_contact;
  end if;
  insert into public.event_contacts (organisation_id, event_id, contact_id, role)
  values (ev.organisation_id, ev.id, v_contact, nullif(left(trim(coalesce(p_role, '')), 60), ''))
  on conflict (event_id, contact_id) do update set role = coalesce(excluded.role, public.event_contacts.role);

  update public.event_contacts set invited_at = now()
  where event_id = ev.id and contact_id = v_contact and (invited_at is null or invited_at < now() - interval '1 hour')
  returning true into v_send;

  update public.calendar_events set sync_status = 'pending' where event_id = ev.id and kind = 'event';

  select trim(k.first_name || ' ' || coalesce(k.last_name, '')) into v_by from public.contacts k where k.portal_user_id = auth.uid() and k.customer_id = ev.customer_id limit 1;
  insert into public.notifications (organisation_id, type, title, body, link, entity_type, entity_id)
  values (ev.organisation_id, 'customer.person_added', coalesce(v_by, 'The client') || ' added ' || v_first || ' to ' || ev.name,
          v_email || coalesce(' · ' || nullif(trim(coalesce(p_role, '')), ''), ''), '/events/' || ev.id, 'event', ev.id);
  insert into public.activity_logs (organisation_id, actor_id, actor_type, actor_label, action, entity_type, entity_id, customer_id, event_id, summary)
  values (ev.organisation_id, auth.uid(), 'customer', v_by, 'portal.person_added', 'event', ev.id, ev.customer_id, ev.id,
          coalesce(v_by, 'The client') || ' added ' || v_first || ' (' || v_email || ') to the booking in the portal');
  return jsonb_build_object('email', v_email, 'first_name', v_first, 'invited_by', v_by, 'send', coalesce(v_send, false));
end $function$;

notify pgrst, 'reload schema';

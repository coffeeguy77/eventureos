-- 0083: customers get an ABN (sent to Xero as the contact's tax number), and converting an enquiry finds the right
-- company: a company that already has the person as a contact, or the one company customer on the same work email
-- domain — instead of creating a new person-customer (who then gets invoiced, and added to Xero, in their own name).

alter table public.customers add column if not exists abn text;

-- Convert an enquiry into an event in one transaction.
-- SECURITY INVOKER: runs as the signed-in user, so RLS still decides access.
create or replace function public.convert_enquiry_to_event(p_enquiry_id uuid, p_event_name text default null)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  e public.enquiries%rowtype;
  v_customer uuid;
  v_contact uuid;
  v_event uuid;
  v_event_number integer;
  v_first text;
  v_last text;
  v_actor text;
  v_domain text;
begin
  select * into e from public.enquiries where id = p_enquiry_id for update;
  if not found then
    raise exception 'Enquiry not found or you do not have access to it';
  end if;
  if e.event_id is not null then
    return e.event_id;
  end if;

  select coalesce(full_name, email) into v_actor from public.users where id = auth.uid();

  v_customer := e.customer_id;
  v_contact := e.contact_id;

  -- Match an existing customer by email before creating a new one
  if v_customer is null and e.contact_email is not null then
    select c.id into v_customer from public.customers c
    where c.organisation_id = e.organisation_id and lower(c.email) = lower(e.contact_email)
    order by c.created_at limit 1;
  end if;

  -- …or a company that already has this person as a contact (e.g. a council officer booking for the council)
  if v_customer is null and e.contact_email is not null then
    select ct.customer_id, ct.id into v_customer, v_contact from public.contacts ct
    join public.customers c on c.id = ct.customer_id
    where ct.organisation_id = e.organisation_id and lower(ct.email) = lower(e.contact_email)
    order by (c.kind = 'company') desc, ct.is_primary desc, ct.created_at limit 1;
  end if;

  -- …or the one company customer that uses the same work email domain (never for gmail, outlook and the like)
  if v_customer is null and e.contact_email is not null and e.company is null then
    v_domain := lower(split_part(e.contact_email, '@', 2));
    if v_domain <> '' and v_domain <> all (array['gmail.com','googlemail.com','outlook.com','outlook.com.au','hotmail.com','hotmail.com.au','live.com','live.com.au','msn.com',
        'yahoo.com','yahoo.com.au','ymail.com','icloud.com','me.com','mac.com','bigpond.com','bigpond.net.au','optusnet.com.au','iinet.net.au','tpg.com.au',
        'internode.on.net','westnet.com.au','aol.com','protonmail.com','proton.me','gmx.com','zoho.com','fastmail.com']) then
      select case when count(distinct x.id) = 1 then min(x.id::text)::uuid end into v_customer from (
        select c.id from public.customers c where c.organisation_id = e.organisation_id and c.kind = 'company' and lower(c.email) like '%@' || v_domain
        union
        select c.id from public.contacts ct join public.customers c on c.id = ct.customer_id
        where ct.organisation_id = e.organisation_id and c.kind = 'company' and lower(ct.email) like '%@' || v_domain
      ) x;
    end if;
  end if;

  if v_customer is null then
    if coalesce(e.contact_name, e.company) is null then
      raise exception 'Add a contact name or company to the enquiry before converting it';
    end if;
    insert into public.customers (organisation_id, kind, name, company, email, phone, source, created_by)
    values (e.organisation_id,
            case when e.company is not null then 'company' else 'individual' end,
            coalesce(e.company, e.contact_name), e.company, e.contact_email, e.contact_phone, e.source, auth.uid())
    returning id into v_customer;

    insert into public.activity_logs (organisation_id, actor_id, action, entity_type, entity_id, customer_id, enquiry_id, summary)
    values (e.organisation_id, auth.uid(), 'customer.created', 'customer', v_customer, v_customer, e.id,
            coalesce(v_actor, 'Someone') || ' created customer ' || coalesce(e.company, e.contact_name));
  end if;

  if v_contact is null then
    select ct.id into v_contact from public.contacts ct
    where ct.customer_id = v_customer
      and (e.contact_email is null or lower(ct.email) = lower(e.contact_email))
    order by ct.is_primary desc, ct.created_at limit 1;
  end if;

  if v_contact is null and e.contact_name is not null then
    v_first := split_part(e.contact_name, ' ', 1);
    v_last := nullif(trim(substr(e.contact_name, length(v_first) + 1)), '');
    insert into public.contacts (organisation_id, customer_id, first_name, last_name, email, phone, is_primary, created_by)
    values (e.organisation_id, v_customer, v_first, v_last, e.contact_email, e.contact_phone,
            not exists (select 1 from public.contacts where customer_id = v_customer), auth.uid())
    returning id into v_contact;
  end if;

  insert into public.events (organisation_id, name, customer_id, primary_contact_id, enquiry_id, event_type, event_date,
                             venue, guest_count, budget, status, assigned_to, next_action, created_by)
  values (e.organisation_id, coalesce(nullif(trim(p_event_name), ''), e.title), v_customer, v_contact, e.id, e.event_type,
          e.event_date, e.venue, e.guest_count, e.budget, 'planning', coalesce(e.assigned_to, auth.uid()),
          'Create a quote', auth.uid())
  returning id, number into v_event, v_event_number;

  if v_contact is not null then
    insert into public.event_contacts (organisation_id, event_id, contact_id, role)
    values (e.organisation_id, v_event, v_contact, 'Primary contact');
  end if;

  update public.enquiries set
    customer_id = v_customer,
    contact_id = coalesce(contact_id, v_contact),
    event_id = v_event,
    status = case when status in ('new','needs_review','contacted','qualified') then 'quote_required'::public.enquiry_status else status end,
    next_action = null,
    next_action_due = null
  where id = e.id;

  -- Bring the enquiry's conversation and tasks onto the event
  update public.email_threads set event_id = v_event, customer_id = coalesce(customer_id, v_customer)
  where enquiry_id = e.id and event_id is null;
  update public.tasks set event_id = v_event, customer_id = coalesce(customer_id, v_customer)
  where enquiry_id = e.id and event_id is null;
  update public.notes set event_id = v_event, customer_id = coalesce(customer_id, v_customer)
  where enquiry_id = e.id and event_id is null;

  insert into public.activity_logs (organisation_id, actor_id, action, entity_type, entity_id, customer_id, event_id, enquiry_id, summary)
  values (e.organisation_id, auth.uid(), 'enquiry.converted', 'event', v_event, v_customer, v_event, e.id,
          coalesce(v_actor, 'Someone') || ' converted ENQ-' || e.number || ' into event EV-' || v_event_number);

  return v_event;
end $$;

revoke all on function public.convert_enquiry_to_event(uuid, text) from public, anon;
grant execute on function public.convert_enquiry_to_event(uuid, text) to authenticated;

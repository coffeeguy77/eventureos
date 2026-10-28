-- Web Culture split, step 1 (run once, Oct 2026): create the Web Culture organisation, copy its clients, their
-- contacts and their web invoices + payments across from Bean Culture, and move hosting and recurring invoices.
-- Bean Culture keeps its own copies until step 2 (after the Xero sync knows which invoices belong where).
do $$
declare
  v_split constant text := 'web-culture-2026-10';
  v_bc constant uuid := '56fbec7d-ff7b-4481-8b48-fd1bd1894fde';
  v_owner constant uuid := '4a2ee4ca-70ef-4aa9-9c3e-984335364904';
  v_wc uuid;
  n_c int; n_k int; n_i int; n_p int; n_h int; n_r int;
begin
  if exists (select 1 from public.organisations where slug = 'webculture') then raise exception 'Web Culture already exists'; end if;

  insert into public.organisations (name, slug, business_type, contact_email, contact_phone, address, website, timezone, currency, plan, app_access, created_by, settings)
  select 'Web Culture', 'webculture', 'Web design & hosting agency', 'hello@webculture.au', '02 6223 2222', 'U5, 47-49 Vicars St, Mitchell ACT 2911',
         'https://webculture.au', o.timezone, o.currency, 'growth', array['hosting','nerdherd'], v_owner,
         jsonb_build_object('quote_acceptance_action', 'full_invoice', 'deposit_percent', 0, 'quote_follow_up_days', 3,
                            'default_payment_terms_days', coalesce((o.settings->>'default_payment_terms_days')::int, 14), 'invoice_prefix', 'WC-')
  from public.organisations o where o.id = v_bc
  returning id into v_wc;

  insert into public.organisation_users (organisation_id, user_id, role, status) values (v_wc, v_owner, 'owner', 'active');
  insert into public.calendar_connections (organisation_id, name, is_default, created_by) values (v_wc, 'Web Culture', true, v_owner);
  insert into public.integrations (organisation_id, provider) values (v_wc, 'gmail'), (v_wc, 'google_calendar'), (v_wc, 'xero');
  -- RepairShopr tickets went up to #4210: carry on from #4211
  insert into public.organisation_counters (organisation_id, key, value) values (v_wc, 'support_tickets', 4210);

  -- Which clients are Web Culture's: a web invoice, a hosting account or a recurring invoice
  create temp table wc_cust on commit drop as
    select distinct customer_id as id from public.invoices where organisation_id = v_bc and private.is_web_lines(line_items)
    union select customer_id from public.hosting_accounts where organisation_id = v_bc and customer_id is not null
    union select customer_id from public.recurring_invoices where organisation_id = v_bc;

  -- Clients
  insert into private.org_split_map (split, kind, old_id, new_id) select v_split, 'customer', id, gen_random_uuid() from wc_cust;
  insert into public.customers (id, organisation_id, kind, name, company, email, phone, address, notes, source, tags, customer_since, xero_contact_id, created_at, updated_at, created_by, payment_terms_days)
  select m.new_id, v_wc, c.kind, c.name, c.company, c.email, c.phone, c.address, c.notes, c.source,
         array_remove(c.tags, 'Web Culture'), c.customer_since, c.xero_contact_id, c.created_at, c.updated_at, c.created_by, c.payment_terms_days
  from public.customers c join private.org_split_map m on m.split = v_split and m.kind = 'customer' and m.old_id = c.id;
  get diagnostics n_c = row_count;

  -- Their people (portal logins are per business, so they're not carried over)
  insert into private.org_split_map (split, kind, old_id, new_id)
  select v_split, 'contact', k.id, gen_random_uuid() from public.contacts k where k.organisation_id = v_bc and k.customer_id in (select id from wc_cust);
  insert into public.contacts (id, organisation_id, customer_id, first_name, last_name, email, phone, position, is_primary, created_at, updated_at, created_by)
  select mk.new_id, v_wc, mc.new_id, k.first_name, k.last_name, k.email, k.phone, k.position, k.is_primary, k.created_at, k.updated_at, k.created_by
  from public.contacts k
  join private.org_split_map mk on mk.split = v_split and mk.kind = 'contact' and mk.old_id = k.id
  join private.org_split_map mc on mc.split = v_split and mc.kind = 'customer' and mc.old_id = k.customer_id;
  get diagnostics n_k = row_count;

  -- Web invoices (all came from Xero)
  insert into private.org_split_map (split, kind, old_id, new_id)
  select v_split, 'invoice', i.id, gen_random_uuid() from public.invoices i where i.organisation_id = v_bc and private.is_web_lines(i.line_items);
  insert into public.invoices (id, organisation_id, number, customer_id, kind, issue_date, due_date, subtotal, tax_total, total, amount_paid, status, currency,
    xero_invoice_id, xero_synced_at, created_at, updated_at, created_by, reference, line_items, origin, emailed_at, email_count, first_viewed_at, last_viewed_at, view_count, reminders)
  select mi.new_id, v_wc, i.number, mc.new_id, i.kind, i.issue_date, i.due_date, i.subtotal, i.tax_total, i.total, i.amount_paid, i.status, i.currency,
    i.xero_invoice_id, i.xero_synced_at, i.created_at, i.updated_at, i.created_by, i.reference, i.line_items, i.origin, i.emailed_at, i.email_count, i.first_viewed_at, i.last_viewed_at, i.view_count, i.reminders
  from public.invoices i
  join private.org_split_map mi on mi.split = v_split and mi.kind = 'invoice' and mi.old_id = i.id
  join private.org_split_map mc on mc.split = v_split and mc.kind = 'customer' and mc.old_id = i.customer_id;
  get diagnostics n_i = row_count;

  insert into private.org_split_map (split, kind, old_id, new_id)
  select v_split, 'payment', p.id, gen_random_uuid() from public.payments p
  where p.organisation_id = v_bc and p.invoice_id in (select old_id from private.org_split_map where split = v_split and kind = 'invoice');
  insert into public.payments (id, organisation_id, invoice_id, amount, paid_at, method, reference, xero_payment_id, created_at, created_by, stripe_payment_intent, xero_push_error)
  select mp.new_id, v_wc, mi.new_id, p.amount, p.paid_at, p.method, p.reference, p.xero_payment_id, p.created_at, p.created_by, p.stripe_payment_intent, p.xero_push_error
  from public.payments p
  join private.org_split_map mp on mp.split = v_split and mp.kind = 'payment' and mp.old_id = p.id
  join private.org_split_map mi on mi.split = v_split and mi.kind = 'invoice' and mi.old_id = p.invoice_id;
  get diagnostics n_p = row_count;

  -- Hosting: servers, accounts (pointing at the copied client and invoice) and their log
  update public.hosting_servers set organisation_id = v_wc, updated_at = now() where organisation_id = v_bc;
  update public.hosting_accounts a set organisation_id = v_wc,
    customer_id = (select new_id from private.org_split_map where split = v_split and kind = 'customer' and old_id = a.customer_id),
    invoice_id = (select new_id from private.org_split_map where split = v_split and kind = 'invoice' and old_id = a.invoice_id),
    updated_at = now()
  where a.organisation_id = v_bc;
  get diagnostics n_h = row_count;
  update public.hosting_events set organisation_id = v_wc where organisation_id = v_bc;

  -- Recurring invoices (all paused)
  update public.recurring_invoices r set organisation_id = v_wc,
    customer_id = (select new_id from private.org_split_map where split = v_split and kind = 'customer' and old_id = r.customer_id),
    last_invoice_id = (select new_id from private.org_split_map where split = v_split and kind = 'invoice' and old_id = r.last_invoice_id),
    updated_at = now()
  where r.organisation_id = v_bc;
  get diagnostics n_r = row_count;

  -- Hosting settings (notice templates, dry run etc.) go with the hosting
  update public.organisations w set settings = w.settings || jsonb_build_object('hosting', b.settings->'hosting')
  from public.organisations b where w.id = v_wc and b.id = v_bc and b.settings ? 'hosting';

  -- Bean Culture: mark the clients that are web-only, so they're easy to find and tidy up later
  update public.customers c set tags = array_append(c.tags, 'Web Culture')
  where c.organisation_id = v_bc and c.id in (select id from wc_cust) and not ('Web Culture' = any(c.tags));

  insert into public.activity_logs (organisation_id, actor_id, action, entity_type, entity_id, summary)
  values (v_wc, v_owner, 'organisation.created', 'organisation', v_wc,
          format('Web Culture set up from Bean Culture: %s clients, %s contacts, %s invoices, %s payments, %s hosting accounts and %s recurring invoices moved across', n_c, n_k, n_i, n_p, n_h, n_r));
  raise notice 'WC % customers % contacts % invoices % payments % hosting % recurring %', v_wc, n_c, n_k, n_i, n_p, n_h, n_r;
end $$;

-- Web Culture split, step 2 — run AFTER the code with Xero scope + shared connections is live.
--  1. Bean Culture's Xero connection is shared with Web Culture and stops taking web invoices (accounts 666x).
--  2. Web Culture's Xero connection borrows Bean Culture's tokens and takes only web invoices, carrying on from
--     the moment step 1 copied them (so nothing in between is missed).
--  3. Bean Culture's copies of the web invoices (and their payments) are removed — every removed row is kept in
--     private.org_split_backup first.
do $$
declare
  v_split constant text := 'web-culture-2026-10';
  v_bc constant uuid := '56fbec7d-ff7b-4481-8b48-fd1bd1894fde';
  v_owner constant uuid := '4a2ee4ca-70ef-4aa9-9c3e-984335364904';
  v_wc uuid := (select id from public.organisations where slug = 'webculture');
  b record;
  v_since text;
  v_scope jsonb := jsonb_build_object('accounts', jsonb_build_array('666'),
    'items', jsonb_build_array('RepairShopr','AWHSD','AWHS','AWSEC','AWBSS','AWBSSD','AWBSSDP','SSLEC','domain','GAMM','GAMMS','BDNW','HWCSR','SRWMC','LSEOMM','SMMM','WSEOMM'));
  n_i int; n_p int;
begin
  if v_wc is null then raise exception 'Web Culture not found — run step 1 first'; end if;
  select * into b from public.integrations where organisation_id = v_bc and provider = 'xero';
  if b.id is null or b.status <> 'connected' then raise exception 'Bean Culture Xero is not connected'; end if;
  -- an hour before step 1 ran, to be safe
  select to_char((min(created_at) - interval '1 hour') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') into v_since
  from private.org_split_map where split = v_split;

  update public.integrations set settings = settings
      || jsonb_build_object('shared_with', jsonb_build_array(v_wc::text), 'scope', v_scope || jsonb_build_object('mode', 'exclude')),
    updated_at = now()
  where id = b.id;

  update public.integrations set status = 'connected', account_label = b.account_label, external_account_id = b.external_account_id,
    connected_at = now(), connected_by = v_owner, last_error = null, updated_at = now(),
    settings = jsonb_strip_nulls(jsonb_build_object(
      'shared_from', b.id::text, 'tenant_id', b.settings->>'tenant_id', 'tenant_name', b.settings->>'tenant_name',
      'scope', v_scope || jsonb_build_object('mode', 'include'),
      'invoices_synced_at', v_since, 'quotes_synced_at', v_since, 'payments_synced_at', v_since, 'contacts_synced_at', v_since,
      'push_invoices', b.settings->'push_invoices', 'sales_account_code', '6664', 'tax_type', b.settings->'tax_type', 'account_names', b.settings->'account_names'))
  where organisation_id = v_wc and provider = 'xero';
  if not found then raise exception 'Web Culture has no Xero row'; end if;

  -- Back up, then remove Bean Culture's copies of the web invoices (payments go with them)
  insert into private.org_split_backup (split, kind, row_data)
  select v_split, 'payments', to_jsonb(p) from public.payments p
  where p.organisation_id = v_bc and p.invoice_id in (select id from public.invoices where organisation_id = v_bc and private.is_web_lines(line_items));
  get diagnostics n_p = row_count;
  insert into private.org_split_backup (split, kind, row_data)
  select v_split, 'invoices', to_jsonb(i) from public.invoices i where i.organisation_id = v_bc and private.is_web_lines(i.line_items);
  get diagnostics n_i = row_count;
  delete from public.invoices where organisation_id = v_bc and private.is_web_lines(line_items);

  insert into public.activity_logs (organisation_id, actor_id, action, entity_type, entity_id, summary)
  values (v_bc, v_owner, 'xero.shared', 'integration', b.id,
          format('Xero shared with Web Culture. Web invoices (accounts 666x) now belong to Web Culture: %s invoices and %s payments moved out of Bean Culture (backed up).', n_i, n_p));
  raise notice 'Removed % invoices and % payments from Bean Culture; Web Culture syncs Xero from %', n_i, n_p, v_since;
end $$;

-- RepairShopr (webculture.repairshopr.com) → Nerd Herd, Oct 2026.
-- 8 recurring "Scheduled Regular Website Maintenance Check" schedules become maintenance plans: PAUSED, so nobody is
-- billed twice — switch each on after pausing it in RepairShopr. Each run raises the invoice (emailed, like
-- RepairShopr did), opens a maintenance job that waits for payment, and goes to Xero on account 6664.
-- The 6 open RepairShopr tickets keep their numbers (4201–4210).
do $$
declare
  v_wc uuid := (select id from public.organisations where slug = 'webculture');
  r record;
  v_line jsonb;
begin
  if v_wc is null then raise exception 'Web Culture not found'; end if;
  -- names that came through Xero with a broken apostrophe
  update public.customers set name = replace(name, 'â€™', '’'), company = replace(company, 'â€™', '’') where organisation_id = v_wc and (name like '%â€™%' or company like '%â€™%');

  for r in select * from (values
    ('Wholesale Sleeper Co.', 1, '2026-11-15'::date, 120::numeric),
    ('Dainere’s Rainbow', 1, '2026-11-15', 60),
    ('Peak Learning', 1, '2026-11-15', 120),
    ('Capital Region Community Services', 1, '2026-11-25', 120),
    ('The Horticultural Society Of Canberra Incorporated', 3, '2026-11-01', 120),
    ('Laggner Constructions', 3, '2026-11-06', 120),
    ('Optic Nerve Canberra', 6, '2027-01-08', 120),
    ('Cozy Insulation', 3, '2026-11-27', 240)
  ) as x(client, months, next_run, ex_gst) loop
    v_line := jsonb_build_array(jsonb_build_object(
      'description', 'Scheduled Regular Website Maintenance Check' || E'\n' || 'CMS and plugin updates, malware and security scan, and compatibility testing after updates.',
      'quantity', 1, 'unit_amount', round(r.ex_gst * 1.1, 2), 'tax_rate', 10, 'item_code', null, 'account_code', '6664', 'inc', true));
    insert into public.recurring_invoices (organisation_id, customer_id, name, category, status, source, every, unit, anchor_day, next_date,
      due_type, due_days, send_mode, line_items, total, creates_ticket, work_after_payment, website_id, notes, created_by)
    select v_wc, c.id, 'Website maintenance check', 'maintenance', 'paused', 'manual', r.months, 'month', extract(day from r.next_run)::int, r.next_run,
      'days_after', 0, 'email', v_line, round(r.ex_gst * 1.1, 2), true, true,
      (select w.id from public.websites w where w.customer_id = c.id and w.status <> 'archived' order by w.created_at limit 1),
      'Imported from RepairShopr (Oct 2026). Pause it in RepairShopr, then switch this on.', null
    from public.customers c where c.organisation_id = v_wc and c.name = r.client
      and not exists (select 1 from public.recurring_invoices x where x.customer_id = c.id and x.creates_ticket);
    if not found then raise notice 'Skipped maintenance plan for % (client not found, or already has one)', r.client; end if;
  end loop;

  insert into public.support_tickets (organisation_id, number, customer_id, subject, status, priority, kind, source, external_ref, created_by)
  select v_wc, x.num, (select c.id from public.customers c where c.organisation_id = v_wc and c.name = x.client), x.subject, 'new', x.priority, x.kind, 'repairshopr', 'RS #' || x.num, null
  from (values
    (4201, 'Shaun Matthews', 'Looking at getting website updated monthly', 'high', 'maintenance'),
    (4204, 'Botanica Landscapes', 'Domain', 'normal', 'hosting'),
    (4205, null, 'Aril Aril — JUFE-47p (billing)', 'normal', 'billing'),
    (4206, null, 'Aril Aril — JUFE-470 (technical)', 'normal', 'support'),
    (4209, 'The Australian Brain Cancer Foundation (ABCF)', 'Urgent - CPanel Access', 'normal', 'hosting'),
    (4210, 'Arash Akhyani', 'website is down', 'normal', 'support')
  ) as x(num, client, subject, priority, kind)
  where not exists (select 1 from public.support_tickets t where t.organisation_id = v_wc and t.number = x.num);

  insert into public.support_ticket_updates (organisation_id, ticket_id, kind, body, author_name)
  select v_wc, t.id, 'system', 'Brought across from RepairShopr ' || t.external_ref || ' (subject only — the original notes and dates are still in RepairShopr).', 'Nerd Herd'
  from public.support_tickets t where t.organisation_id = v_wc and t.source = 'repairshopr'
    and not exists (select 1 from public.support_ticket_updates u where u.ticket_id = t.id);
end $$;

-- =====================================================================
-- EventureOS 0047 — Delete jobs, quotes and unpaid invoices; credit the balance of an invoice
--   invoice_credits        : credit notes against an invoice (e.g. deposit paid, event cancelled, balance written off)
--   credit_invoice(...)    : records a credit and settles that much of the balance (Xero invoices too — the app
--                            creates and allocates the credit note in Xero first and passes its id)
--   delete_invoice(...)    : an invoice nobody has paid anything on, that isn't in Xero
--   delete_quote(...)      : a quote with no live invoices (void ones are kept and just unlinked)
--   delete_job(...)        : a job with its quotes, unpaid invoices, enquiry, emails, crew and calendar rows —
--                            only when no money has been received and no staff have been paid for it
-- None of these touch Gmail. Safe to run more than once.
-- =====================================================================

create table if not exists public.invoice_credits (
  id                  uuid primary key default gen_random_uuid(),
  organisation_id     uuid not null references public.organisations(id) on delete cascade,
  invoice_id          uuid not null,
  number              text not null check (char_length(number) between 1 and 60),
  amount              numeric(12,2) not null check (amount > 0),
  credit_date         date not null,
  reason              text not null check (char_length(reason) between 1 and 500),
  xero_credit_note_id text,
  created_by          uuid references public.users(id),
  created_at          timestamptz not null default now(),
  foreign key (invoice_id, organisation_id) references public.invoices(id, organisation_id) on delete cascade
);
create index if not exists invoice_credits_invoice_idx on public.invoice_credits (invoice_id);
alter table public.invoice_credits enable row level security;
drop policy if exists invoice_credits_select on public.invoice_credits;
create policy invoice_credits_select on public.invoice_credits for select to authenticated using (public.is_org_staff(organisation_id));
-- Written only through credit_invoice()

-- ---------------------------------------------------------------------
create or replace function public.credit_invoice(p_invoice_id uuid, p_amount numeric, p_reason text, p_date date, p_number text default null, p_xero_credit_note_id text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare inv public.invoices%rowtype; v_amount numeric(12,2); v_paid numeric(12,2); v_id uuid; v_number text; v_actor text; n int;
begin
  if auth.uid() is null then raise exception 'You must be signed in'; end if;
  select * into inv from public.invoices where id = p_invoice_id for update;
  if not found then raise exception 'Invoice not found'; end if;
  if not public.is_org_manager(inv.organisation_id) then raise exception 'Only owners, admins and managers can credit invoices'; end if;
  if inv.status = 'void' then raise exception 'Invoice % is void', inv.number; end if;
  if inv.xero_invoice_id is not null and p_xero_credit_note_id is null then raise exception 'Invoice % is in Xero — the credit note has to be made in Xero first', inv.number; end if;
  v_amount := round(coalesce(p_amount, 0), 2);
  if v_amount <= 0 then raise exception 'The credit must be more than zero'; end if;
  if v_amount > inv.balance then raise exception 'The credit (%) is more than the balance owing (%)', to_char(v_amount, 'FM$999,999,990.00'), to_char(inv.balance, 'FM$999,999,990.00'); end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Give a reason for the credit'; end if;
  select count(*) into n from public.invoice_credits where invoice_id = inv.id;
  v_number := coalesce(nullif(trim(coalesce(p_number, '')), ''), 'CN-' || inv.number || case when n > 0 then '-' || (n + 1) else '' end);

  insert into public.invoice_credits (organisation_id, invoice_id, number, amount, credit_date, reason, xero_credit_note_id, created_by)
  values (inv.organisation_id, inv.id, left(v_number, 60), v_amount, coalesce(p_date, public.org_today(inv.organisation_id)), left(trim(p_reason), 500), p_xero_credit_note_id, auth.uid())
  returning id into v_id;

  -- Like Xero: "paid" on an invoice counts payments plus credits, so the balance owing drops by the credit.
  -- Reports use the payments table, so a credit is never counted as money received.
  v_paid := inv.amount_paid + v_amount;
  update public.invoices set amount_paid = v_paid,
    status = case when v_paid >= inv.total then 'paid'::public.invoice_status else inv.status end
  where id = inv.id;

  select coalesce(full_name, email) into v_actor from public.users where id = auth.uid();
  insert into public.activity_logs (organisation_id, actor_id, actor_type, action, entity_type, entity_id, customer_id, event_id, summary, metadata)
  values (inv.organisation_id, auth.uid(), 'user', 'invoice.credited', 'invoice', inv.id, inv.customer_id, inv.event_id,
    coalesce(v_actor, 'Someone') || ' credited ' || to_char(v_amount, 'FM$999,999,990.00') || ' on ' || inv.number || ' (' || v_number || ') — ' || left(trim(p_reason), 200),
    jsonb_build_object('credit_id', v_id, 'amount', v_amount, 'reason', p_reason, 'xero_credit_note_id', p_xero_credit_note_id));
  return v_id;
end $$;
revoke all on function public.credit_invoice(uuid, numeric, text, date, text, text) from public, anon;
grant execute on function public.credit_invoice(uuid, numeric, text, date, text, text) to authenticated;

-- ---------------------------------------------------------------------
create or replace function public.delete_invoice(p_org uuid, p_invoice_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare inv public.invoices%rowtype;
begin
  if not public.is_org_manager(p_org) then raise exception 'Only owners, admins and managers can delete invoices'; end if;
  select * into inv from public.invoices where id = p_invoice_id and organisation_id = p_org for update;
  if not found then raise exception 'Invoice not found'; end if;
  if inv.xero_invoice_id is not null then raise exception '% is in Xero — void it instead (that voids it in Xero too)', inv.number; end if;
  if inv.amount_paid > 0 or exists (select 1 from public.payments where invoice_id = inv.id) or exists (select 1 from public.invoice_credits where invoice_id = inv.id) then
    raise exception 'Money has been received or credited on % — credit the balance instead of deleting it', inv.number;
  end if;
  delete from public.notifications where organisation_id = p_org and entity_id = inv.id;
  delete from public.invoices where id = inv.id;
  return inv.number;
end $$;
revoke all on function public.delete_invoice(uuid, uuid) from public, anon;
grant execute on function public.delete_invoice(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
create or replace function public.delete_quote(p_org uuid, p_quote_id uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare q record; v_live text; v_versions uuid[];
begin
  if not public.is_org_manager(p_org) then raise exception 'Only owners, admins and managers can delete quotes'; end if;
  select id, number into q from public.quotes where id = p_quote_id and organisation_id = p_org for update;
  if not found then raise exception 'Quote not found'; end if;
  select string_agg(number, ', ') into v_live from public.invoices where organisation_id = p_org and quote_id = q.id and status <> 'void';
  if v_live is not null then raise exception 'Invoice % is still live for this quote — delete or void it first', v_live; end if;
  update public.invoices set quote_id = null where organisation_id = p_org and quote_id = q.id;   -- void ones stay on record
  select coalesce(array_agg(id), '{}') into v_versions from public.quote_versions where quote_id = q.id;
  delete from public.notifications where organisation_id = p_org and entity_id = any(v_versions || q.id);
  delete from public.quotes where id = q.id;   -- sections, lines, versions, sent emails and files go with it
  return q.number;
end $$;
revoke all on function public.delete_quote(uuid, uuid) from public, anon;
grant execute on function public.delete_quote(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
create or replace function public.delete_job(p_org uuid, p_event_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare ev record; v_quotes uuid[]; v_enq uuid[]; v_inv uuid[]; v_thr uuid[]; v_block text; v_n_inv int;
begin
  if not public.is_org_manager(p_org) then raise exception 'Only owners, admins and managers can delete jobs'; end if;
  select id, number, name into ev from public.events where id = p_event_id and organisation_id = p_org for update;
  if not found then raise exception 'Job not found'; end if;
  select coalesce(array_agg(id), '{}') into v_quotes from public.quotes where organisation_id = p_org and event_id = ev.id;

  -- Never delete money
  select string_agg(number, ', ') into v_block from public.invoices i
  where i.organisation_id = p_org and (i.event_id = ev.id or i.quote_id = any(v_quotes))
    and (i.amount_paid > 0 or exists (select 1 from public.payments p where p.invoice_id = i.id) or exists (select 1 from public.invoice_credits c where c.invoice_id = i.id));
  if v_block is not null then raise exception 'Money has been received on % — set the job to Cancelled and credit the balance instead', v_block; end if;
  select string_agg(number, ', ') into v_block from public.invoices i
  where i.organisation_id = p_org and (i.event_id = ev.id or i.quote_id = any(v_quotes)) and i.xero_invoice_id is not null and i.status <> 'void';
  if v_block is not null then raise exception '% is in Xero — void it first (that voids it in Xero too), then delete the job', v_block; end if;
  if exists (select 1 from public.event_crew where organisation_id = p_org and event_id = ev.id and payment_id is not null) then
    raise exception 'Staff have been paid for this job — set it to Cancelled instead';
  end if;

  -- Invoices: local unpaid ones go; void Xero ones stay on record, unlinked
  select coalesce(array_agg(id), '{}') into v_inv from public.invoices
  where organisation_id = p_org and (event_id = ev.id or quote_id = any(v_quotes)) and xero_invoice_id is null;
  v_n_inv := cardinality(v_inv);
  update public.invoices set event_id = null, quote_id = null where organisation_id = p_org and (event_id = ev.id or quote_id = any(v_quotes)) and xero_invoice_id is not null;
  delete from public.invoices where id = any(v_inv);

  -- The enquiry it came from, and the email conversations about it
  select coalesce(array_agg(id), '{}') into v_enq from public.enquiries where organisation_id = p_org and event_id = ev.id;
  select coalesce(array_agg(id), '{}') into v_thr from public.email_threads where organisation_id = p_org and (event_id = ev.id or enquiry_id = any(v_enq));
  delete from public.email_threads where id = any(v_thr);
  update public.enquiries set event_id = null where id = any(v_enq);

  delete from public.notifications where organisation_id = p_org and entity_id = any(array[ev.id] || v_quotes || v_enq || v_inv || v_thr);
  delete from public.activity_logs where organisation_id = p_org and (event_id = ev.id or enquiry_id = any(v_enq) or entity_id = any(array[ev.id] || v_quotes || v_enq || v_inv || v_thr));
  delete from public.events where id = ev.id;     -- quotes, crew, people, calendar rows, tasks, notes and files go with it
  delete from public.enquiries where id = any(v_enq);
  return jsonb_build_object('number', ev.number, 'name', ev.name, 'quotes', cardinality(v_quotes), 'invoices', v_n_inv, 'enquiries', cardinality(v_enq), 'threads', cardinality(v_thr));
end $$;
revoke all on function public.delete_job(uuid, uuid) from public, anon;
grant execute on function public.delete_job(uuid, uuid) to authenticated;

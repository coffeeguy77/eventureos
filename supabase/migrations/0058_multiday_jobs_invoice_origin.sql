-- =====================================================================
-- 0058_multiday_jobs_invoice_origin.sql
--
-- 1. events.days     : a job over several dates, each with its own hours —
--                      [{ "date": "2026-10-20", "setup": "08:30", "start": "09:00", "finish": "13:00" }, …]
--                      Empty for one-day jobs (they keep using event_date / setup_time / start_time / finish_time).
--                      Each day gets its own calendar entry.
-- 2. invoices.origin : 'eventureos' for invoices raised here (quotes, bookings, by hand),
--                      'xero' for invoices brought in from Xero's history.
--                      The Invoices page lists EventureOS invoices; the Xero tab lists everything in Xero.
-- Adds columns only; nothing existing is changed or removed. Safe to run more than once.
-- =====================================================================

alter table public.events add column if not exists days jsonb not null default '[]'::jsonb;

alter table public.invoices add column if not exists origin text not null default 'eventureos';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'invoices_origin_check') then
    alter table public.invoices add constraint invoices_origin_check check (origin in ('eventureos', 'xero'));
  end if;
end $$;

-- Invoices that came in from Xero: no quote, nobody here created them, and no "invoice created" entry in the activity log
update public.invoices i set origin = 'xero'
where i.origin = 'eventureos'
  and i.xero_invoice_id is not null
  and i.quote_id is null
  and i.created_by is null
  and i.kind = 'other'
  and not exists (select 1 from public.activity_logs a where a.entity_id = i.id and a.action = 'invoice.created')
  and not exists (select 1 from public.bookings b where b.invoice_id = i.id);

create index if not exists invoices_org_origin_idx on public.invoices (organisation_id, origin, issue_date desc);

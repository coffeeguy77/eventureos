-- =====================================================================
-- EventureOS 0104 — Nerd Herd AI maintenance
--   nh_ai_jobs : one job on one connected website — a written request for Claude to carry out, or a quick
--                action (update plugins / WordPress / everything). Every job makes a backup on the site first.
--                The job keeps Claude's working conversation (so it can carry on across runs), the time-stamped
--                list of changes, the report, the "normal web designer" hours estimate and the draft invoice.
--   support_ticket_quotes.ai_job / ai_request : "run this with AI maintenance once it's paid".
--   When a quote's invoice is paid and the quote is marked for AI, the job is queued straight away.
--   pg_cron (every minute) wakes the runner (/api/cron/nerd-herd-ai) while there is work.
-- Run once in Supabase → SQL Editor. Safe to run again.
-- =====================================================================

create table if not exists public.nh_ai_jobs (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  number           integer,
  website_id       uuid not null references public.websites(id) on delete cascade,
  customer_id      uuid references public.customers(id) on delete set null,
  ticket_id        uuid references public.support_tickets(id) on delete set null,
  quote_id         uuid references public.support_ticket_quotes(id) on delete set null,
  kind             text not null default 'request' check (kind in ('request', 'update_plugins', 'update_core', 'update_all')),
  request          text,
  billable         boolean not null default false,
  source           text not null default 'staff' check (source in ('staff', 'quote')),
  status           text not null default 'queued' check (status in ('queued', 'backing_up', 'running', 'finishing', 'done', 'needs_attention', 'failed', 'cancelled')),
  stage_note       text,                                   -- what it is doing right now, for the screen
  backup_scope     text check (backup_scope in ('database', 'code', 'full')),
  backup_id        text,
  backup           jsonb,                                  -- the site's manifest of the finished backup
  model            text,
  messages         jsonb not null default '[]'::jsonb,     -- Claude's working conversation (internal)
  turns            integer not null default 0,
  changes          jsonb not null default '[]'::jsonb,     -- [{ at, summary, change_id, tool, ok }]
  report_summary   text,                                   -- one line: what was done
  report           text,                                   -- the full report (markdown)
  notes            text,                                   -- anything the tech should check
  manual_hours     numeric(6,2),                           -- what a web designer would take doing it by hand
  hours_breakdown  jsonb,                                  -- [{ task, hours }]
  invoice_id       uuid references public.invoices(id) on delete set null,
  input_tokens     integer not null default 0,
  output_tokens    integer not null default 0,
  cost_usd         numeric(10,4) not null default 0,
  error            text,
  net_errors       integer not null default 0,
  locked_until     timestamptz,
  created_by       uuid references public.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  started_at       timestamptz,
  finished_at      timestamptz,
  updated_at       timestamptz not null default now()
);
create index if not exists nh_ai_jobs_org on public.nh_ai_jobs (organisation_id, created_at desc);
create index if not exists nh_ai_jobs_site on public.nh_ai_jobs (website_id, created_at desc);
create index if not exists nh_ai_jobs_active on public.nh_ai_jobs (status) where status in ('queued', 'backing_up', 'running', 'finishing');
create unique index if not exists nh_ai_jobs_quote on public.nh_ai_jobs (quote_id) where quote_id is not null;
create unique index if not exists nh_ai_jobs_number on public.nh_ai_jobs (organisation_id, number);

-- Job numbers per organisation (AI-1, AI-2 …)
create or replace function public.nh_ai_job_number()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.number is null then
    perform pg_advisory_xact_lock(hashtext('nh_ai_jobs:' || new.organisation_id::text));
    select coalesce(max(number), 0) + 1 into new.number from public.nh_ai_jobs where organisation_id = new.organisation_id;
  end if;
  return new;
end $$;
drop trigger if exists nh_ai_jobs_number on public.nh_ai_jobs;
create trigger nh_ai_jobs_number before insert on public.nh_ai_jobs for each row execute function public.nh_ai_job_number();
revoke all on function public.nh_ai_job_number() from public, anon, authenticated;

alter table public.nh_ai_jobs enable row level security;
drop policy if exists nh_ai_jobs_staff on public.nh_ai_jobs;
create policy nh_ai_jobs_staff on public.nh_ai_jobs for all to authenticated
  using (public.is_org_staff(organisation_id)) with check (public.is_org_staff(organisation_id));

-- Quotes: run with AI maintenance once paid
alter table public.support_ticket_quotes add column if not exists ai_job boolean not null default false;
alter table public.support_ticket_quotes add column if not exists ai_request text;

-- ---------------------------------------------------------------------
-- Waking the runner: the app's /api/cron/nerd-herd-ai, signed with the same Vault secret as the sync (0029)
-- ---------------------------------------------------------------------
create or replace function public.nh_ai_kick()
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_secret text;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'sync_trigger_secret';
  if v_secret is null then return null; end if;
  return net.http_post(
    url := 'https://www.eventureos.com.au/api/cron/nerd-herd-ai',
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 300000);
end $$;
revoke all on function public.nh_ai_kick() from public, anon, authenticated;
grant execute on function public.nh_ai_kick() to service_role;

-- Every minute: only calls the app when a job is waiting and nobody is already working on it
create or replace function public.nh_ai_tick()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.nh_ai_jobs where status in ('queued', 'backing_up', 'running', 'finishing') and (locked_until is null or locked_until < now())) then
    perform public.nh_ai_kick();
  end if;
end $$;
revoke all on function public.nh_ai_tick() from public, anon, authenticated;

do $$ begin
  perform cron.unschedule('nerd-herd-ai') where exists (select 1 from cron.job where jobname = 'nerd-herd-ai');
  perform cron.schedule('nerd-herd-ai', '* * * * *', 'select public.nh_ai_tick()');
end $$;

-- Take the next job to work on (one runner per job at a time)
create or replace function public.nh_ai_claim(p_job uuid default null, p_seconds integer default 290)
returns setof public.nh_ai_jobs language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  select id into v_id from public.nh_ai_jobs
   where status in ('queued', 'backing_up', 'running', 'finishing') and (locked_until is null or locked_until < now())
     and (p_job is null or id = p_job)
   order by created_at
   limit 1 for update skip locked;
  if v_id is null then return; end if;
  return query update public.nh_ai_jobs set locked_until = now() + make_interval(secs => p_seconds), updated_at = now()
   where id = v_id returning *;
end $$;
revoke all on function public.nh_ai_claim(uuid, integer) from public, anon, authenticated;
grant execute on function public.nh_ai_claim(uuid, integer) to service_role;

-- ---------------------------------------------------------------------
-- Paid quote marked for AI → queue the job (no new invoice: the quote's invoice has paid for it)
-- ---------------------------------------------------------------------
create or replace function public.nh_quote_paid_ai()
returns trigger language plpgsql security definer set search_path = '' as $$
declare q record; v_job uuid;
begin
  for q in select sq.id, sq.organisation_id, sq.ticket_id, sq.seq, sq.kind, sq.title, sq.description, sq.ai_request,
                  t.number, t.website_id, t.customer_id, (wc.website_id is not null) as connected
           from public.support_ticket_quotes sq
           join public.support_tickets t on t.id = sq.ticket_id
           left join public.website_connectors wc on wc.website_id = t.website_id
           where sq.invoice_id = new.id and sq.ai_job loop
    if q.website_id is null or not q.connected then
      insert into public.support_ticket_updates (organisation_id, ticket_id, kind, body, author_id, author_name)
      values (q.organisation_id, q.ticket_id, 'system', 'This quote was marked for AI maintenance, but the ticket''s website isn''t connected to the Web Culture Connector — do the work by hand or connect the site and start it from Nerd Herd → AI maintenance.', null, 'Nerd Herd');
      continue;
    end if;
    insert into public.nh_ai_jobs (organisation_id, website_id, customer_id, ticket_id, quote_id, kind, request, billable, source, status, stage_note)
    values (q.organisation_id, q.website_id, q.customer_id, q.ticket_id, q.id, 'request',
            coalesce(nullif(trim(q.ai_request), ''), q.title || E'\n\n' || coalesce(q.description, '')), false, 'quote', 'queued', 'Paid — queued')
    on conflict (quote_id) where quote_id is not null do nothing
    returning id into v_job;
    if v_job is not null then
      insert into public.support_ticket_updates (organisation_id, ticket_id, kind, body, author_id, author_name)
      values (q.organisation_id, q.ticket_id, 'system', (case when q.kind = 'variation' then 'Variation ' else 'Quote ' end) || q.seq || ' paid — AI maintenance job queued (backup first, then the changes).', null, 'Nerd Herd');
    end if;
  end loop;
  if v_job is not null then perform public.nh_ai_kick(); end if;
  return new;
end $$;
drop trigger if exists invoices_nh_quote_paid_ai on public.invoices;
create trigger invoices_nh_quote_paid_ai after update of status on public.invoices for each row
  when (new.status = 'paid' and old.status is distinct from 'paid') execute function public.nh_quote_paid_ai();
revoke all on function public.nh_quote_paid_ai() from public, anon, authenticated;

-- Maintenance history can now hold AI jobs, backups and content changes
alter table public.website_maintenance_runs drop constraint if exists website_maintenance_runs_action_check;
alter table public.website_maintenance_runs add constraint website_maintenance_runs_action_check
  check (action in ('connect', 'check', 'update', 'purge', 'disconnect', 'lock', 'unlock', 'login', 'other', 'ai', 'backup', 'content', 'restore'));
alter table public.website_maintenance_runs add column if not exists ai_job_id uuid references public.nh_ai_jobs(id) on delete set null;

-- 0116 Mail-outs (Nerd Herd) — one email to many clients, sent in steady batches, with a working unsubscribe (Nov 2026)
--
--  * nh_mailouts       the email (subject + body), who it goes to, and how it's going
--  * nh_mailout_sends  one row per recipient: queued → sent / failed / skipped; its own unsubscribe token
--  * customers.unsubscribed_at   set when a client unsubscribes from mail-outs (never emailed by a mail-out again)
--  * pg_cron 'mailouts' every 5 minutes → /api/cron/mailouts (Vault secret sync_trigger_secret, as for marketing)
-- Adds only. Safe to run again.

create table if not exists public.nh_mailouts (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  subject         text not null,
  body            text not null,
  audience        text not null default 'repairshopr' check (audience in ('repairshopr','all','xero')),
  status          text not null default 'draft' check (status in ('draft','sending','paused','done')),
  per_run         integer not null default 40 check (per_run between 1 and 200),
  total           integer not null default 0,
  sent            integer not null default 0,
  failed          integer not null default 0,
  created_by      uuid references public.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  started_at      timestamptz,
  finished_at     timestamptz
);
create index if not exists nh_mailouts_org on public.nh_mailouts (organisation_id, created_at desc);

create table if not exists public.nh_mailout_sends (
  id              uuid primary key default gen_random_uuid(),
  mailout_id      uuid not null references public.nh_mailouts(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  customer_id     uuid references public.customers(id) on delete set null,
  email           text not null,
  name            text,
  status          text not null default 'queued' check (status in ('queued','sent','failed','skipped')),
  error           text,
  token           uuid not null default gen_random_uuid() unique,
  sent_at         timestamptz,
  created_at      timestamptz not null default now()
);
create unique index if not exists nh_mailout_sends_one on public.nh_mailout_sends (mailout_id, lower(email));
create index if not exists nh_mailout_sends_queue on public.nh_mailout_sends (mailout_id, status);

alter table public.customers add column if not exists unsubscribed_at timestamptz;

alter table public.nh_mailouts enable row level security;
alter table public.nh_mailout_sends enable row level security;
drop policy if exists nh_mailouts_staff on public.nh_mailouts;
create policy nh_mailouts_staff on public.nh_mailouts for all to authenticated
  using (public.is_org_staff(organisation_id)) with check (public.is_org_staff(organisation_id));
drop policy if exists nh_mailout_sends_staff on public.nh_mailout_sends;
create policy nh_mailout_sends_staff on public.nh_mailout_sends for all to authenticated
  using (public.is_org_staff(organisation_id)) with check (public.is_org_staff(organisation_id));

create or replace function public.nh_mailouts_kick()
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_secret text;
begin
  if not exists (select 1 from public.nh_mailouts where status = 'sending') then return null; end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'sync_trigger_secret';
  if v_secret is null then return null; end if;
  return net.http_post(
    url := 'https://www.eventureos.com.au/api/cron/mailouts',
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000);
end $$;
revoke all on function public.nh_mailouts_kick() from public, anon, authenticated;

do $$ begin
  perform cron.unschedule('mailouts') where exists (select 1 from cron.job where jobname = 'mailouts');
  perform cron.schedule('mailouts', '*/5 * * * *', 'select public.nh_mailouts_kick()');
end $$;

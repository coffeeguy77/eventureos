-- =====================================================================
-- EventureOS 0105 — Web Culture Connector keeps itself up to date
--   Every 15 minutes pg_cron wakes /api/cron/connectors, which pushes the newest Connector to any site still
--   behind (and returns straight away when none are). website_connectors records the last attempt and any error,
--   so a site that fails is retried 12 hours later rather than every 15 minutes.
--   Uses the same Vault secret as the sync (sync_trigger_secret, migration 0029).
-- Safe to run more than once.
-- =====================================================================

alter table public.website_connectors add column if not exists auto_update_at timestamptz;
alter table public.website_connectors add column if not exists auto_update_error text;

create or replace function public.wcc_autoupdate_kick()
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_secret text;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'sync_trigger_secret';
  if v_secret is null then return null; end if;
  return net.http_post(
    url := 'https://www.eventureos.com.au/api/cron/connectors',
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 300000);
end $$;
revoke all on function public.wcc_autoupdate_kick() from public, anon, authenticated;
grant execute on function public.wcc_autoupdate_kick() to service_role;

do $$ begin
  perform cron.unschedule('wcc-autoupdate') where exists (select 1 from cron.job where jobname = 'wcc-autoupdate');
  perform cron.schedule('wcc-autoupdate', '*/15 * * * *', 'select public.wcc_autoupdate_kick()');
end $$;

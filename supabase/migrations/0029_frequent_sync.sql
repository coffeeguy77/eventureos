-- Vercel Hobby only runs its cron once a day — far too slow to notice a midnight booking for the next morning.
-- pg_cron calls /api/cron/sync every 10 minutes for Gmail (and every 30 for Google Calendar) using pg_net.
-- The bearer secret lives in Supabase Vault as 'sync_trigger_secret' and in Vercel as SYNC_TRIGGER_SECRET
-- (created by hand — never commit it):  select vault.create_secret('<secret>', 'sync_trigger_secret');
create extension if not exists pg_net with schema extensions;

create or replace function public.trigger_integration_sync(p_providers text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  v_secret text;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'sync_trigger_secret';
  if v_secret is null then raise exception 'Vault secret sync_trigger_secret is missing'; end if;
  return net.http_get(
    url := 'https://www.eventureos.com.au/api/cron/sync?providers=' || p_providers,
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret),
    timeout_milliseconds := 300000);
end $$;
revoke all on function public.trigger_integration_sync(text) from public, anon, authenticated;

select cron.schedule('sync-gmail', '*/10 * * * *', $$select public.trigger_integration_sync('gmail')$$);
select cron.schedule('sync-google-calendar', '5,35 * * * *', $$select public.trigger_integration_sync('google_calendar')$$);

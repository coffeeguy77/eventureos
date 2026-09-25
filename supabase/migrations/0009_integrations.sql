-- =====================================================================
-- EventureOS 0009 — integrations (Gmail, Google Calendar, Xero) + AI triage.
-- Additive only.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Email: RFC 2822 threading + classification detail
-- ---------------------------------------------------------------------
-- Message-ID header of each message, so replies sent from EventureOS carry
-- correct In-Reply-To / References headers and stay in the same Gmail thread.
alter table public.email_messages add column if not exists rfc_message_id text;
-- Reply-To header (website form notifications usually set it to the customer)
alter table public.email_messages add column if not exists reply_to text;
create index if not exists email_messages_rfc_message_id on public.email_messages (organisation_id, rfc_message_id);

-- Why a thread was classified the way it was, and what was extracted from it
alter table public.email_threads add column if not exists classification_reasons text[] not null default '{}';
alter table public.email_threads add column if not exists extracted jsonb;
-- Staff dismissed the "create enquiry from this email" suggestion
alter table public.email_threads add column if not exists suggestion_dismissed_at timestamptz;

-- ---------------------------------------------------------------------
-- Audit entries written by integrations (actor_type = 'integration').
-- activity_logs only lets users insert rows as themselves, so sync code
-- goes through this function. Callable by staff of the org, or by the
-- service role (background sync).
-- ---------------------------------------------------------------------
create or replace function public.log_integration_activity(
  p_org uuid, p_provider text, p_action text, p_entity_type text, p_entity_id uuid, p_summary text,
  p_customer uuid default null, p_event uuid default null, p_enquiry uuid default null, p_metadata jsonb default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (public.is_org_staff(p_org) or coalesce(auth.role(), '') = 'service_role') then
    raise exception 'Not allowed';
  end if;
  if p_action !~ '^(email|integration|calendar|xero|enquiry|invoice|payment|customer|contact|import)\.[a-z_.]+$' then
    raise exception 'Invalid integration action %', p_action;
  end if;
  insert into public.activity_logs (organisation_id, actor_id, actor_type, actor_label, action, entity_type, entity_id,
                                    customer_id, event_id, enquiry_id, summary, metadata)
  values (p_org, auth.uid(), 'integration',
          case p_provider when 'gmail' then 'Gmail' when 'google_calendar' then 'Google Calendar' when 'xero' then 'Xero'
                          when 'ai' then 'AI assistant' else initcap(p_provider) end,
          p_action, p_entity_type, p_entity_id, p_customer, p_event, p_enquiry, left(p_summary, 500), p_metadata);
end $$;

-- ---------------------------------------------------------------------
-- Token access for background sync (cron with SUPABASE_SERVICE_ROLE_KEY).
-- get_integration_tokens / update_integration_access_token check the
-- signed-in user, which a cron job doesn't have. These twins are
-- executable by service_role ONLY.
-- ---------------------------------------------------------------------
create or replace function public.service_get_integration_tokens(p_integration_id uuid)
returns table (access_token text, refresh_token text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Not allowed'; end if;
  return query select c.access_token, c.refresh_token, c.expires_at from public.integration_credentials c where c.integration_id = p_integration_id;
end $$;

create or replace function public.service_update_integration_access_token(p_integration_id uuid, p_access_token text, p_expires_at timestamptz, p_refresh_token text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Not allowed'; end if;
  update public.integration_credentials set access_token = p_access_token, expires_at = p_expires_at,
    refresh_token = coalesce(p_refresh_token, refresh_token), updated_at = now()
  where integration_id = p_integration_id;
end $$;

revoke all on function public.log_integration_activity(uuid, text, text, text, uuid, text, uuid, uuid, uuid, jsonb) from public, anon;
revoke all on function public.service_get_integration_tokens(uuid) from public, anon, authenticated;
revoke all on function public.service_update_integration_access_token(uuid, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.log_integration_activity(uuid, text, text, text, uuid, text, uuid, uuid, uuid, jsonb) to authenticated, service_role;
grant execute on function public.service_get_integration_tokens(uuid) to service_role;
grant execute on function public.service_update_integration_access_token(uuid, text, timestamptz, text) to service_role;

-- Emailing quotes (and, later, other documents) with a tracked link for each recipient.
--   email_sends             — one "Send" action: who sent what, the subject and message
--   email_send_recipients   — each address it went to, with its own unguessable link token and delivery status (from Resend)
--   document_link_views     — each time a recipient opened their link: when, device, approximate location
-- Customers open /q/<token> without signing in (like Xero's online quotes). The token is 64 random hex characters.

create table if not exists public.email_sends (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  kind text not null check (kind in ('quote')),
  quote_id uuid references public.quotes(id) on delete cascade,
  quote_version_id uuid references public.quote_versions(id) on delete set null,
  version_number int,
  subject text not null check (char_length(subject) <= 200),
  message text not null check (char_length(message) <= 5000),
  from_name text,
  reply_to text,
  signature_version int,
  sent_by uuid references public.users(id) on delete set null,
  sent_at timestamptz not null default now()
);
create index if not exists email_sends_quote_idx on public.email_sends (quote_id, sent_at desc);

create table if not exists public.email_send_recipients (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  send_id uuid not null references public.email_sends(id) on delete cascade,
  quote_id uuid references public.quotes(id) on delete cascade,
  email text not null check (char_length(email) <= 254),
  name text check (char_length(name) <= 120),
  role text not null default 'to' check (role in ('to', 'copy')),  -- 'copy' = the sender's own copy; its opens aren't counted
  token text not null unique check (token ~ '^[0-9a-f]{64}$'),
  resend_id text unique,
  status text not null default 'queued' check (status in ('queued','sent','delivered','delayed','bounced','complained','failed')),
  status_at timestamptz,
  error text check (char_length(error) <= 500),
  email_opened_at timestamptz,     -- from Resend open tracking (only if enabled on the domain; approximate)
  link_clicked_at timestamptz,     -- from Resend click tracking (only if enabled)
  first_viewed_at timestamptz,     -- first time the quote link was opened in a browser
  last_viewed_at timestamptz,
  view_count int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists email_send_recipients_send_idx on public.email_send_recipients (send_id);
create index if not exists email_send_recipients_quote_idx on public.email_send_recipients (quote_id);

create table if not exists public.document_link_views (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  recipient_id uuid not null references public.email_send_recipients(id) on delete cascade,
  quote_id uuid references public.quotes(id) on delete cascade,
  version_number int,
  viewed_at timestamptz not null default now(),
  ip inet,
  user_agent text check (char_length(user_agent) <= 400),
  city text check (char_length(city) <= 100),
  region text check (char_length(region) <= 100),
  country text check (char_length(country) <= 8)
);
create index if not exists document_link_views_recipient_idx on public.document_link_views (recipient_id, viewed_at desc);

alter table public.email_sends enable row level security;
alter table public.email_send_recipients enable row level security;
alter table public.document_link_views enable row level security;

-- Office team (owner/admin/manager/sales) can see and create sends; delivery updates and views are written by the server.
drop policy if exists email_sends_read on public.email_sends;
create policy email_sends_read on public.email_sends for select to authenticated using (public.is_org_staff(organisation_id));
drop policy if exists email_sends_insert on public.email_sends;
create policy email_sends_insert on public.email_sends for insert to authenticated
  with check (public.is_org_staff(organisation_id) and sent_by = auth.uid());

drop policy if exists email_send_recipients_read on public.email_send_recipients;
create policy email_send_recipients_read on public.email_send_recipients for select to authenticated using (public.is_org_staff(organisation_id));
drop policy if exists email_send_recipients_insert on public.email_send_recipients;
create policy email_send_recipients_insert on public.email_send_recipients for insert to authenticated
  with check (public.is_org_staff(organisation_id)
    and exists (select 1 from public.email_sends s where s.id = send_id and s.organisation_id = email_send_recipients.organisation_id));
drop policy if exists email_send_recipients_update on public.email_send_recipients;
create policy email_send_recipients_update on public.email_send_recipients for update to authenticated
  using (public.is_org_staff(organisation_id)) with check (public.is_org_staff(organisation_id));

drop policy if exists document_link_views_read on public.document_link_views;
create policy document_link_views_read on public.document_link_views for select to authenticated using (public.is_org_staff(organisation_id));

-- ---------------------------------------------------------------------------------------------------------------
-- Public quote link: what a recipient sees. Returns null for an unknown token. Never exposes other recipients.
create or replace function public.quote_link_get(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  r public.email_send_recipients%rowtype;
  q public.quotes%rowtype;
  v public.quote_versions%rowtype;
  o public.organisations%rowtype;
  ev public.events%rowtype;
  c public.customers%rowtype;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return null; end if;
  select * into r from public.email_send_recipients where token = p_token;
  if not found or r.quote_id is null then return null; end if;
  select * into q from public.quotes where id = r.quote_id;
  if not found or q.current_version_id is null then return null; end if;
  select * into v from public.quote_versions where id = q.current_version_id;
  select * into o from public.organisations where id = q.organisation_id;
  select * into ev from public.events where id = q.event_id;
  select * into c from public.customers where id = q.customer_id;
  return jsonb_build_object(
    'recipient', jsonb_build_object('name', r.name, 'email', r.email, 'role', r.role),
    'quote', jsonb_build_object('id', q.id, 'number', q.number, 'status', q.status, 'expiry_date', q.expiry_date, 'expired', q.expiry_date is not null and q.expiry_date < public.org_today(q.organisation_id)),
    'version', jsonb_build_object('id', v.id, 'number', v.version_number, 'status', v.status, 'snapshot', v.snapshot,
       'subtotal', v.subtotal, 'tax_total', v.tax_total, 'total', v.total, 'published_at', v.published_at,
       'responded_at', v.responded_at, 'accepted_by_name', v.accepted_by_name, 'decline_reason', v.decline_reason),
    'org', jsonb_build_object('name', o.name, 'logo_url', o.logo_url, 'brand_colour', o.brand_colour, 'contact_email', o.contact_email,
       'contact_phone', o.contact_phone, 'website', o.website, 'currency', o.currency, 'timezone', o.timezone,
       'booking_approval', coalesce(o.settings->>'booking_approval', 'off'),
       -- Would accepting now be held for the business to approve? (same rule as run_quote_accepted)
       'approval_on_accept', ev.approval_status is distinct from 'approved' and (
          coalesce(o.settings->>'booking_approval', 'off') = 'all'
          or (coalesce(o.settings->>'booking_approval', 'off') = 'short_notice' and ev.event_date is not null
              and ev.event_date - public.org_today(o.id) <= greatest(0, coalesce((o.settings->>'booking_approval_days')::integer, 2))))),
    'event', jsonb_build_object('id', ev.id, 'name', ev.name, 'event_date', ev.event_date, 'venue', ev.venue),
    'customer', jsonb_build_object('name', c.name)
  );
end $$;

-- Record that a recipient opened their link (called from the page after it has loaded in a real browser).
-- Opens of the sender's own copy are ignored. The first real open marks the quote version as viewed.
create or replace function public.quote_link_viewed(p_token text, p_ip text, p_user_agent text, p_city text, p_region text, p_country text)
returns void language plpgsql security definer set search_path = public as $$
declare
  r public.email_send_recipients%rowtype;
  q public.quotes%rowtype;
  v public.quote_versions%rowtype;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return; end if;
  select * into r from public.email_send_recipients where token = p_token for update;
  if not found or r.role <> 'to' or r.quote_id is null then return; end if;
  select * into q from public.quotes where id = r.quote_id;
  select * into v from public.quote_versions where id = q.current_version_id;
  -- One entry per recipient per 10 minutes (refreshes and tab switches aren't separate views)
  if r.last_viewed_at is not null and r.last_viewed_at > now() - interval '10 minutes' then
    update public.email_send_recipients set last_viewed_at = now() where id = r.id;
    return;
  end if;
  insert into public.document_link_views (organisation_id, recipient_id, quote_id, version_number, ip, user_agent, city, region, country)
  values (r.organisation_id, r.id, r.quote_id, v.version_number, public.try_inet(split_part(coalesce(p_ip, ''), ',', 1)),
          left(p_user_agent, 400), left(p_city, 100), left(p_region, 100), left(p_country, 8));
  update public.email_send_recipients
    set first_viewed_at = coalesce(first_viewed_at, now()), last_viewed_at = now(), view_count = view_count + 1
    where id = r.id;
  if v.id is not null and v.viewed_at is null then
    update public.quote_versions set viewed_at = now(), status = case when status = 'sent' then 'viewed'::public.quote_status else status end where id = v.id;
    update public.quotes set status = 'viewed' where id = q.id and status = 'sent';
    insert into public.activity_logs (organisation_id, actor_type, actor_label, action, entity_type, entity_id, customer_id, event_id, summary)
    values (q.organisation_id, 'customer', coalesce(r.name, r.email), 'quote.viewed', 'quote', q.id, q.customer_id, q.event_id,
            coalesce(r.name, r.email) || ' opened Quote Q-' || q.number || ' (version ' || v.version_number || ')');
  end if;
end $$;

-- Accept or decline through a quote link. Same rules as the portal (current version only, not expired, name to accept).
create or replace function public.quote_link_respond(p_token text, p_decision text, p_name text, p_reason text, p_ip text, p_user_agent text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  r public.email_send_recipients%rowtype;
  q public.quotes%rowtype;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then raise exception 'This link isn''t valid'; end if;
  select * into r from public.email_send_recipients where token = p_token;
  if not found or r.quote_id is null then raise exception 'This link isn''t valid'; end if;
  if r.role <> 'to' then raise exception 'This is the sender''s copy — only the customer can respond from their own link'; end if;
  select * into q from public.quotes where id = r.quote_id;
  if q.current_version_id is null then raise exception 'This quote isn''t available'; end if;
  perform public._record_quote_response(q.current_version_id, p_decision, p_name, p_reason, p_ip, p_user_agent, 'customer');
  return q.event_id;
end $$;

-- Delivery updates from Resend's webhook (server only).
create or replace function public.email_recipient_event(p_resend_id text, p_type text, p_at timestamptz)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_status text;
begin
  v_status := case p_type
    when 'email.sent' then 'sent' when 'email.delivered' then 'delivered' when 'email.delivery_delayed' then 'delayed'
    when 'email.bounced' then 'bounced' when 'email.complained' then 'complained' when 'email.failed' then 'failed' else null end;
  if p_type = 'email.opened' then
    update public.email_send_recipients set email_opened_at = coalesce(email_opened_at, p_at) where resend_id = p_resend_id;
  elsif p_type = 'email.clicked' then
    update public.email_send_recipients set link_clicked_at = coalesce(link_clicked_at, p_at) where resend_id = p_resend_id;
  elsif v_status is not null then
    -- Don't let a late "sent" or "delayed" overwrite a final outcome
    update public.email_send_recipients set status = v_status, status_at = p_at
    where resend_id = p_resend_id
      and not (v_status in ('sent','delayed') and status in ('delivered','bounced','complained','failed'));
  end if;
end $$;

revoke all on function public.quote_link_get(text) from public, anon, authenticated;
revoke all on function public.quote_link_viewed(text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.quote_link_respond(text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.email_recipient_event(text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.quote_link_get(text) to service_role;
grant execute on function public.quote_link_viewed(text, text, text, text, text, text) to service_role;
grant execute on function public.quote_link_respond(text, text, text, text, text, text) to service_role;
grant execute on function public.email_recipient_event(text, text, timestamptz) to service_role;

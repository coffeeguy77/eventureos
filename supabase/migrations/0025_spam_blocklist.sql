-- =====================================================================
-- EventureOS 0025 — Spam folder & blocked senders
--   enquiries.status 'spam' (added to the enum in its own migration) = the Spam folder
--   email_blocklist = senders that are never imported again (email address or whole domain)
-- =====================================================================
alter table public.enquiries add column if not exists spam_reason text;
create index if not exists enquiries_org_status_idx on public.enquiries (organisation_id, status, received_at desc);

create table if not exists public.email_blocklist (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  value           text not null check (value = lower(value) and value ~ '^(@?[a-z0-9.-]+\.[a-z]{2,}|[^\s@]+@[a-z0-9.-]+\.[a-z]{2,})$'),
  reason          text,
  hits            integer not null default 0,
  last_hit_at     timestamptz,
  created_by      uuid references public.users(id) default auth.uid(),
  created_at      timestamptz not null default now(),
  unique (organisation_id, value)
);
alter table public.email_blocklist enable row level security;
create policy email_blocklist_select on public.email_blocklist for select to authenticated using (public.is_org_staff(organisation_id));
create policy email_blocklist_insert on public.email_blocklist for insert to authenticated with check (public.is_org_staff(organisation_id));
create policy email_blocklist_update on public.email_blocklist for update to authenticated using (public.is_org_staff(organisation_id)) with check (public.is_org_staff(organisation_id));
create policy email_blocklist_delete on public.email_blocklist for delete to authenticated using (public.is_org_staff(organisation_id));

-- Delete spam enquiries and their (unlinked) email conversations. Nothing is deleted from Gmail.
create or replace function public.delete_spam(p_org uuid, p_enquiry_ids uuid[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_enq uuid[]; v_thr uuid[];
begin
  if not public.is_org_staff(p_org) then raise exception 'Not allowed'; end if;
  select coalesce(array_agg(id), '{}') into v_enq from public.enquiries
  where organisation_id = p_org and id = any(p_enquiry_ids) and status = 'spam' and event_id is null;
  select coalesce(array_agg(t.id), '{}') into v_thr from public.email_threads t
  where t.organisation_id = p_org and t.enquiry_id = any(v_enq) and t.event_id is null;
  delete from public.email_threads where id = any(v_thr);
  delete from public.notifications where organisation_id = p_org and entity_id = any(v_enq || v_thr);
  delete from public.activity_logs where organisation_id = p_org and actor_type in ('integration', 'system') and (enquiry_id = any(v_enq) or entity_id = any(v_enq || v_thr));
  delete from public.enquiries where id = any(v_enq);
  return jsonb_build_object('enquiries', cardinality(v_enq), 'threads', cardinality(v_thr));
end $$;
revoke all on function public.delete_spam(uuid, uuid[]) from public, anon;
grant execute on function public.delete_spam(uuid, uuid[]) to authenticated;

-- Count a blocked email (called by the sync, which may run as the service role)
create or replace function public.blocklist_hit(p_id uuid)
returns void language sql security definer set search_path = '' as $$
  update public.email_blocklist set hits = hits + 1, last_hit_at = now()
  where id = p_id and (auth.uid() is null or public.is_org_staff(organisation_id));
$$;
revoke all on function public.blocklist_hit(uuid) from public, anon;
grant execute on function public.blocklist_hit(uuid) to authenticated, service_role;

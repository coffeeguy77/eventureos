-- =====================================================================
-- EventureOS 0046 — Star enquiries to think about, and delete enquiries outright
--   enquiries.starred_at / starred_by / star_note : a team-wide star with an optional "what to think about" note
--   delete_enquiries(org, ids)                    : remove enquiries (e.g. your own test) without spam or blocking.
--                                                   Never touches Gmail; skips anything already turned into an event.
-- Safe to run more than once.
-- =====================================================================

alter table public.enquiries add column if not exists starred_at timestamptz;
alter table public.enquiries add column if not exists starred_by uuid references public.users(id) on delete set null;
alter table public.enquiries add column if not exists star_note  text check (star_note is null or char_length(star_note) <= 1000);
create index if not exists enquiries_starred_idx on public.enquiries (organisation_id, starred_at desc) where starred_at is not null;

create or replace function public.delete_enquiries(p_org uuid, p_enquiry_ids uuid[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_enq uuid[]; v_thr uuid[];
begin
  if not public.is_org_manager(p_org) then raise exception 'Only owners, admins and managers can delete enquiries'; end if;
  -- Not ones that became an event (delete the event's own records instead)
  select coalesce(array_agg(q.id), '{}') into v_enq from public.enquiries q
  where q.organisation_id = p_org and q.id = any(p_enquiry_ids) and q.event_id is null
    and not exists (select 1 from public.events ev where ev.organisation_id = p_org and ev.enquiry_id = q.id);
  -- Their email conversations go too, unless a conversation is also on a job (then it just stops pointing here)
  select coalesce(array_agg(t.id), '{}') into v_thr from public.email_threads t
  where t.organisation_id = p_org and t.enquiry_id = any(v_enq) and t.event_id is null;
  update public.email_threads set enquiry_id = null where organisation_id = p_org and enquiry_id = any(v_enq) and event_id is not null;
  delete from public.email_threads where id = any(v_thr);
  delete from public.notifications where organisation_id = p_org and entity_id = any(v_enq || v_thr);
  delete from public.activity_logs where organisation_id = p_org and (enquiry_id = any(v_enq) or entity_id = any(v_enq || v_thr));
  delete from public.enquiries where id = any(v_enq);   -- tasks, notes and documents on it go with it
  return jsonb_build_object('enquiries', cardinality(v_enq), 'threads', cardinality(v_thr));
end $$;
revoke all on function public.delete_enquiries(uuid, uuid[]) from public, anon;
grant execute on function public.delete_enquiries(uuid, uuid[]) to authenticated;

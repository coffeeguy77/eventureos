-- Remove imported Gmail conversations that don't pass the organisation's email filters.
-- The app decides which threads fail the filter; this function only removes what is safe to remove:
--   * threads not linked to an event or customer
--   * enquiries auto-created from those threads that nobody has worked on
--     (still new / needs review, no event, no notes, tasks or documents, not linked to other kept threads)
--   * the notifications and automatic activity entries those created
-- Nothing is deleted from Gmail. p_dry_run = true only counts.
create or replace function public.cleanup_filtered_emails(p_org uuid, p_thread_ids uuid[], p_dry_run boolean default true)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_threads uuid[];
  v_enquiries uuid[];
  v_msgs integer;
begin
  if not public.is_org_manager(p_org) then raise exception 'Only owners, admins and managers can clean up imported email'; end if;

  select coalesce(array_agg(t.id), '{}') into v_threads
  from public.email_threads t
  where t.organisation_id = p_org and t.id = any(p_thread_ids) and t.event_id is null and t.customer_id is null;

  select coalesce(array_agg(distinct e.id), '{}') into v_enquiries
  from public.enquiries e
  join public.email_threads t on t.enquiry_id = e.id and t.id = any(v_threads)
  where e.organisation_id = p_org
    and e.status in ('new', 'needs_review')
    and e.event_id is null
    and e.source in ('email', 'website')
    and not exists (select 1 from public.notes n where n.enquiry_id = e.id)
    and not exists (select 1 from public.tasks k where k.enquiry_id = e.id)
    and not exists (select 1 from public.documents d where d.enquiry_id = e.id)
    and not exists (select 1 from public.events ev where ev.enquiry_id = e.id)
    and not exists (select 1 from public.email_threads o where o.enquiry_id = e.id and not (o.id = any(v_threads)));

  select count(*) into v_msgs from public.email_messages m where m.thread_id = any(v_threads);

  if not p_dry_run then
    delete from public.email_threads where id = any(v_threads);           -- messages cascade
    delete from public.enquiries where id = any(v_enquiries);
    delete from public.notifications where organisation_id = p_org and entity_id = any(v_threads || v_enquiries);
    delete from public.activity_logs where organisation_id = p_org and actor_type in ('integration', 'system')
      and (entity_id = any(v_threads || v_enquiries) or enquiry_id = any(v_enquiries));
    insert into public.activity_logs (organisation_id, actor_id, action, entity_type, summary, metadata)
    values (p_org, auth.uid(), 'email.filter_cleanup', 'integration',
            coalesce((select coalesce(full_name, email) from public.users where id = auth.uid()), 'Someone')
              || ' removed ' || cardinality(v_threads) || ' imported email conversations and '
              || cardinality(v_enquiries) || ' unworked enquiries that don''t match the email filters (nothing deleted from Gmail)',
            jsonb_build_object('threads', cardinality(v_threads), 'enquiries', cardinality(v_enquiries), 'messages', v_msgs));
  end if;

  return jsonb_build_object('threads', cardinality(v_threads), 'enquiries', cardinality(v_enquiries), 'messages', v_msgs);
end $$;
revoke all on function public.cleanup_filtered_emails(uuid, uuid[], boolean) from public, anon;
grant execute on function public.cleanup_filtered_emails(uuid, uuid[], boolean) to authenticated;

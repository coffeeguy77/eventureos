-- EventureOS 0009 — customer portal: staff can mark a customer's portal messages as read.
-- (The portal_messages_staff policy's WITH CHECK requires author_type = 'staff', so staff cannot
--  update read_at on customer-authored rows directly.)

create or replace function public.staff_mark_portal_messages_read(p_event_id uuid, p_customer_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_org uuid; n integer;
begin
  select organisation_id into v_org from public.events where id = p_event_id and customer_id = p_customer_id;
  if v_org is null or not public.is_org_staff(v_org) then raise exception 'Conversation not found'; end if;
  update public.portal_messages set read_at = now()
  where organisation_id = v_org and event_id = p_event_id and customer_id = p_customer_id
    and author_type = 'customer' and read_at is null;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.staff_mark_portal_messages_read(uuid, uuid) from public, anon;
grant execute on function public.staff_mark_portal_messages_read(uuid, uuid) to authenticated;

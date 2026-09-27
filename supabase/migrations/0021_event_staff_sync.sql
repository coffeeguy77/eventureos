-- =====================================================================
-- EventureOS 0021 — event staffing housekeeping
--  * existing events.assigned_staff → event_staff (event_staff is now the source; assigned_staff is kept in step)
--  * turning on "add to every event" (or accepting an invitation with it on) adds the person to upcoming events
-- =====================================================================
insert into public.event_staff (organisation_id, event_id, user_id, created_by)
select e.organisation_id, e.id, u, null
from public.events e, unnest(e.assigned_staff) u
where exists (select 1 from public.users x where x.id = u)
on conflict (event_id, user_id) do nothing;

create or replace function public.event_staff_sync_array()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_event uuid := coalesce(new.event_id, old.event_id);
begin
  update public.events set assigned_staff = coalesce((select array_agg(user_id order by created_at) from public.event_staff where event_id = v_event), '{}')
  where id = v_event;
  return null;
end $$;
revoke all on function public.event_staff_sync_array() from public, anon, authenticated;
drop trigger if exists event_staff_sync on public.event_staff;
create trigger event_staff_sync after insert or delete on public.event_staff for each row execute function public.event_staff_sync_array();

create or replace function public.member_auto_add_upcoming()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.auto_add_to_events and new.status = 'active' and new.role <> 'customer'
     and (tg_op = 'INSERT' or not old.auto_add_to_events or old.status <> 'active') then
    insert into public.event_staff (organisation_id, event_id, user_id, auto_added, created_by)
    select e.organisation_id, e.id, new.user_id, true, null
    from public.events e
    where e.organisation_id = new.organisation_id
      and e.status not in ('cancelled', 'completed')
      and (e.event_date is null or e.event_date >= public.org_today(e.organisation_id))
    on conflict (event_id, user_id) do nothing;
  end if;
  return new;
end $$;
revoke all on function public.member_auto_add_upcoming() from public, anon, authenticated;
drop trigger if exists members_auto_add_upcoming on public.organisation_users;
create trigger members_auto_add_upcoming after insert or update of auto_add_to_events, status on public.organisation_users
  for each row execute function public.member_auto_add_upcoming();

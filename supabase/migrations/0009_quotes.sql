-- =====================================================================
-- EventureOS 0009 — quote builder support
--   * staff (not just managers) can remove draft sections / line items
--     and quote attachments while drafting
--   * accepted quotes are locked: their draft can no longer be edited
--   * duplicate_quote(): atomic copy of a quote's draft into a new quote
-- Additive only.
-- =====================================================================

-- Drafting a quote is day-to-day staff work: allow staff to remove draft rows.
create policy quote_items_staff_delete on public.quote_items for delete to authenticated
  using (public.is_org_staff(organisation_id));
create policy quote_sections_staff_delete on public.quote_sections for delete to authenticated
  using (public.is_org_staff(organisation_id));
-- ...and attachments that belong to a quote.
create policy documents_quote_staff_delete on public.documents for delete to authenticated
  using (quote_id is not null and public.is_org_staff(organisation_id));

-- Accepted quotes are locked. (Only enforced for signed-in API users so that
-- seeding / maintenance scripts running as the database owner still work.)
create or replace function public.guard_accepted_quote_draft()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_status public.quote_status;
begin
  if auth.uid() is null then return coalesce(new, old); end if;
  select status into v_status from public.quotes where id = coalesce(new.quote_id, old.quote_id);
  if v_status = 'accepted' then
    raise exception 'This quote has been accepted and is locked. Duplicate it to make changes.';
  end if;
  return coalesce(new, old);
end $$;
revoke all on function public.guard_accepted_quote_draft() from public, anon, authenticated;

create trigger quote_items_accepted_lock before insert or update or delete on public.quote_items
  for each row execute function public.guard_accepted_quote_draft();
create trigger quote_sections_accepted_lock before insert or update or delete on public.quote_sections
  for each row execute function public.guard_accepted_quote_draft();

-- Copy a quote's current draft (header, sections, items) into a brand-new draft quote
-- for the same event. Runs as the caller, so RLS applies to every read and write.
create or replace function public.duplicate_quote(p_quote_id uuid, p_expiry date default null)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  q public.quotes%rowtype;
  v_new uuid;
  s record;
  v_sec uuid;
begin
  select * into q from public.quotes where id = p_quote_id;
  if not found then raise exception 'Quote not found or you do not have access'; end if;

  insert into public.quotes (organisation_id, event_id, customer_id, title, status, issue_date, expiry_date,
                             notes, terms, has_unpublished_changes, created_by)
  values (q.organisation_id, q.event_id, q.customer_id, q.title, 'draft', public.org_today(q.organisation_id),
          coalesce(p_expiry, public.org_today(q.organisation_id) + 14), q.notes, q.terms, true, auth.uid())
  returning id into v_new;

  for s in select * from public.quote_sections where quote_id = q.id order by position, created_at loop
    insert into public.quote_sections (organisation_id, quote_id, title, description, position, is_optional)
    values (q.organisation_id, v_new, s.title, s.description, s.position, s.is_optional)
    returning id into v_sec;
    insert into public.quote_items (organisation_id, quote_id, section_id, name, description, quantity, unit, unit_price,
                                    tax_rate, discount_percent, is_optional, is_package, image_url, position)
    select organisation_id, v_new, v_sec, name, description, quantity, unit, unit_price,
           tax_rate, discount_percent, is_optional, is_package, image_url, position
    from public.quote_items where section_id = s.id;
  end loop;

  return v_new;
end $$;
revoke all on function public.duplicate_quote(uuid, date) from public, anon;
grant execute on function public.duplicate_quote(uuid, date) to authenticated;

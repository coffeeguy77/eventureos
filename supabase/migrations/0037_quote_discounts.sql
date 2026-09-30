-- Discounts by amount as well as percentage:
--   • each line: a percentage (existing) OR a dollar amount off the line (ex GST)
--   • the whole quote: a percentage or a dollar amount (ex GST) taken off the subtotal; GST is reduced in proportion

alter table public.quote_items
  add column if not exists discount_amount numeric(12,2) not null default 0 check (discount_amount >= 0);

-- line_total now takes the dollar discount off too (never below zero for a positive line)
alter table public.quote_items drop column if exists line_total;
alter table public.quote_items add column line_total numeric(12,2) generated always as (
  case when quantity * unit_price >= 0
    then greatest(0, round(quantity * unit_price * (1 - discount_percent / 100) - discount_amount, 2))
    else round(quantity * unit_price * (1 - discount_percent / 100), 2)
  end) stored;

alter table public.quotes
  add column if not exists discount_type text check (discount_type in ('percent', 'amount')),
  add column if not exists discount_value numeric(12,2) not null default 0 check (discount_value >= 0),
  add column if not exists discount_label text check (char_length(discount_label) <= 80);
alter table public.quotes add constraint quotes_discount_percent_max check (discount_type is distinct from 'percent' or discount_value <= 100);

-- Changing the quote discount counts as an unpublished change
create or replace function public.quotes_track_changes()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.title, new.notes, new.terms, new.expiry_date, new.discount_type, new.discount_value, new.discount_label)
     is distinct from (old.title, old.notes, old.terms, old.expiry_date, old.discount_type, old.discount_value, old.discount_label)
     and new.has_unpublished_changes is not distinct from old.has_unpublished_changes then
    new.has_unpublished_changes := true;
  end if;
  return new;
end $$;

-- The snapshot the customer sees: lines, then the quote discount, then totals
create or replace function public.build_quote_snapshot(qid uuid)
returns jsonb language sql stable set search_path to '' as $function$
  select jsonb_build_object(
    'title', q.title, 'notes', q.notes, 'terms', q.terms,
    'issue_date', q.issue_date, 'expiry_date', q.expiry_date,
    'sections', coalesce((
      select jsonb_agg(jsonb_build_object(
        'title', s.title, 'description', s.description, 'optional', s.is_optional,
        'items', coalesce((
          select jsonb_agg(jsonb_build_object(
            'name', i.name, 'description', i.description, 'quantity', i.quantity, 'unit', i.unit,
            'unit_price', i.unit_price, 'tax_rate', i.tax_rate, 'discount_percent', i.discount_percent,
            'discount_amount', i.discount_amount,
            'optional', i.is_optional or s.is_optional, 'package', i.is_package, 'image_url', i.image_url,
            'line_total', i.line_total) order by i.position)
          from public.quote_items i where i.section_id = s.id), '[]'::jsonb)) order by s.position)
      from public.quote_sections s where s.quote_id = q.id), '[]'::jsonb),
    'lines_subtotal', t.sub,
    'discount', case when d.amt > 0 then jsonb_build_object(
        'type', q.discount_type, 'value', q.discount_value, 'label', coalesce(nullif(q.discount_label, ''), 'Discount'), 'amount', d.amt)
      else null end,
    'subtotal', t.sub - d.amt,
    'tax_total', round(case when t.sub > 0 then t.tax * (t.sub - d.amt) / t.sub else t.tax end, 2),
    'total', (t.sub - d.amt) + round(case when t.sub > 0 then t.tax * (t.sub - d.amt) / t.sub else t.tax end, 2))
  from public.quotes q,
  lateral (
    select coalesce(round(sum(i.line_total), 2), 0) as sub,
           coalesce(round(sum(i.line_total * i.tax_rate / 100), 2), 0) as tax
    from public.quote_items i
    left join public.quote_sections s on s.id = i.section_id
    where i.quote_id = q.id and not i.is_optional and not coalesce(s.is_optional, false)
  ) t,
  lateral (
    select case
      when q.discount_type = 'percent' then least(t.sub, round(t.sub * q.discount_value / 100, 2))
      when q.discount_type = 'amount' then least(greatest(t.sub, 0), q.discount_value)
      else 0 end as amt
  ) d
  where q.id = qid;
$function$;

-- Duplicating a quote keeps both kinds of discount
create or replace function public.duplicate_quote(p_quote_id uuid, p_expiry date default null::date)
returns uuid language plpgsql set search_path to '' as $function$
declare
  q public.quotes%rowtype;
  v_new uuid;
  s record;
  v_sec uuid;
begin
  select * into q from public.quotes where id = p_quote_id;
  if not found then raise exception 'Quote not found or you do not have access'; end if;

  insert into public.quotes (organisation_id, event_id, customer_id, title, status, issue_date, expiry_date,
                             notes, terms, has_unpublished_changes, created_by, discount_type, discount_value, discount_label)
  values (q.organisation_id, q.event_id, q.customer_id, q.title, 'draft', public.org_today(q.organisation_id),
          coalesce(p_expiry, public.org_today(q.organisation_id) + 14), q.notes, q.terms, true, auth.uid(),
          q.discount_type, q.discount_value, q.discount_label)
  returning id into v_new;

  for s in select * from public.quote_sections where quote_id = q.id order by position, created_at loop
    insert into public.quote_sections (organisation_id, quote_id, title, description, position, is_optional)
    values (q.organisation_id, v_new, s.title, s.description, s.position, s.is_optional)
    returning id into v_sec;
    insert into public.quote_items (organisation_id, quote_id, section_id, name, description, quantity, unit, unit_price,
                                    tax_rate, discount_percent, discount_amount, is_optional, is_package, image_url, position)
    select organisation_id, v_new, v_sec, name, description, quantity, unit, unit_price,
           tax_rate, discount_percent, discount_amount, is_optional, is_package, image_url, position
    from public.quote_items where section_id = s.id;
  end loop;

  return v_new;
end $function$;

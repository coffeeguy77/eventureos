-- Helpers used only by supabase/seed/seed.sql. They live in a private
-- `demo` schema that is NOT exposed through the API.
create extension if not exists "uuid-ossp" with schema extensions;
create schema if not exists demo;
revoke all on schema demo from public, anon, authenticated;

-- Deterministic ids for demo rows
create or replace function demo.u(k text) returns uuid language sql immutable as $$
  select extensions.uuid_generate_v5('7f1c1a52-6d0e-4d1e-9a51-2f0c0e0e5e01'::uuid, k);
$$;

-- Dates/times relative to "today in Canberra"
create or replace function demo.d(n integer) returns date language sql stable as $$
  select (now() at time zone 'Australia/Sydney')::date + n;
$$;
create or replace function demo.at(n integer, hhmm text) returns timestamptz language sql stable as $$
  select ((demo.d(n) + hhmm::time) at time zone 'Australia/Sydney');
$$;
create or replace function demo.ago(minutes integer) returns timestamptz language sql stable as $$
  select now() - make_interval(mins => minutes);
$$;

-- Build a published-quote snapshot from the draft sections/items
create or replace function demo.quote_snapshot(qid uuid, scale numeric default 1)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'title', q.title, 'notes', q.notes, 'terms', q.terms,
    'issue_date', q.issue_date, 'expiry_date', q.expiry_date,
    'sections', coalesce((
      select jsonb_agg(jsonb_build_object(
        'title', s.title,
        'items', coalesce((
          select jsonb_agg(jsonb_build_object(
            'name', i.name, 'description', i.description, 'quantity', i.quantity, 'unit', i.unit,
            'unit_price', i.unit_price, 'tax_rate', i.tax_rate, 'discount_percent', i.discount_percent,
            'optional', i.is_optional, 'package', i.is_package, 'line_total', i.line_total) order by i.position)
          from public.quote_items i where i.section_id = s.id), '[]'::jsonb)) order by s.position)
      from public.quote_sections s where s.quote_id = q.id), '[]'::jsonb),
    'subtotal', t.sub, 'tax_total', round(t.sub * 0.1, 2), 'total', t.sub + round(t.sub * 0.1, 2))
  from public.quotes q,
  lateral (select round(coalesce(sum(i.line_total) filter (where not i.is_optional), 0) * scale, 2) as sub
           from public.quote_items i where i.quote_id = q.id) t
  where q.id = qid;
$$;

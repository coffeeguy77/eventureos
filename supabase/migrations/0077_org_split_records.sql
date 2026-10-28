-- 0077 — Records kept when one business's work is split out into its own organisation (e.g. Web Culture out of
-- Bean Culture): which old record became which new one, and a full copy of every row removed from the old business,
-- so the split can be checked or undone. Nobody signed in can read these (private schema, no grants).

create schema if not exists private;

create table if not exists private.org_split_map (
  split      text not null,                 -- e.g. 'web-culture-2026-10'
  kind       text not null,                 -- customer | contact | invoice | payment
  old_id     uuid not null,
  new_id     uuid not null,
  created_at timestamptz not null default now(),
  primary key (split, kind, old_id)
);

create table if not exists private.org_split_backup (
  id         bigserial primary key,
  split      text not null,
  kind       text not null,                 -- the table the row came from
  row_data   jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists org_split_backup_kind on private.org_split_backup (split, kind);

-- Does an invoice / quote belong to the web side of the business? Its Xero accounts (6661 hosting, 6662 marketing,
-- 6663 domains, 6664 support & maintenance) or its web item codes say so.
create or replace function private.is_web_lines(p_lines jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select exists (
    select 1 from jsonb_array_elements(case when jsonb_typeof(p_lines) = 'array' then p_lines else '[]'::jsonb end) li
    where li->>'account_code' like '666%'
       or li->>'item_code' in ('RepairShopr','AWHSD','AWHS','AWSEC','AWBSS','AWBSSD','AWBSSDP','SSLEC','domain','GAMM','GAMMS','BDNW','HWCSR','SRWMC','LSEOMM','SMMM','WSEOMM'));
$$;

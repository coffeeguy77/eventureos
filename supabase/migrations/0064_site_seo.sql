-- 0064 — Own website domain: the SEO Saver's log of old addresses people still land on.
-- One row per business + address; counts go up each visit. Written only by the website (service role) through
-- site_url_hit(); managers read it in Website → Domain & SEO.

create table if not exists public.site_url_hits (
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  path text not null check (char_length(path) between 1 and 400),
  kind text not null check (kind in ('redirect', 'gone', 'missing')),
  target text,
  referrer text,
  hits integer not null default 1,
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  primary key (organisation_id, path)
);
create index if not exists site_url_hits_recent on public.site_url_hits (organisation_id, last_at desc);

alter table public.site_url_hits enable row level security;
drop policy if exists site_url_hits_select on public.site_url_hits;
create policy site_url_hits_select on public.site_url_hits for select to authenticated using (public.is_org_manager(organisation_id));
drop policy if exists site_url_hits_delete on public.site_url_hits;
create policy site_url_hits_delete on public.site_url_hits for delete to authenticated using (public.is_org_manager(organisation_id));

create or replace function public.site_url_hit(p_org uuid, p_path text, p_kind text, p_target text, p_referrer text)
returns void language sql security definer set search_path = public as $$
  insert into public.site_url_hits (organisation_id, path, kind, target, referrer)
  values (p_org, left(p_path, 400), p_kind, left(p_target, 400), left(p_referrer, 400))
  on conflict (organisation_id, path) do update
    set hits = site_url_hits.hits + 1, kind = excluded.kind, target = excluded.target,
        referrer = coalesce(excluded.referrer, site_url_hits.referrer), last_at = now();
$$;
revoke all on function public.site_url_hit(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.site_url_hit(uuid, text, text, text, text) to service_role;

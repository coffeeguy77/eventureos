-- "Book a demo" requests from the public sales page. Written only through submit_demo_request (anyone, rate-limited);
-- readable by platform admins (Platform admin → Demo requests).
create table if not exists public.demo_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null check (char_length(name) between 2 and 120),
  email text not null check (char_length(email) between 5 and 200),
  company text check (char_length(company) <= 160),
  phone text check (char_length(phone) <= 40),
  business_type text check (char_length(business_type) <= 80),
  team_size text check (char_length(team_size) <= 40),
  message text check (char_length(message) <= 2000),
  source text check (char_length(source) <= 200),
  status text not null default 'new' check (status in ('new','contacted','closed'))
);
alter table public.demo_requests enable row level security;
drop policy if exists demo_requests_admin_read on public.demo_requests;
create policy demo_requests_admin_read on public.demo_requests for select to authenticated using (public.is_super_admin());
drop policy if exists demo_requests_admin_update on public.demo_requests;
create policy demo_requests_admin_update on public.demo_requests for update to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

create or replace function public.submit_demo_request(p_name text, p_email text, p_company text, p_phone text, p_business_type text, p_team_size text, p_message text, p_source text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_email text := lower(trim(p_email));
begin
  if char_length(trim(coalesce(p_name, ''))) < 2 then raise exception 'Please tell us your name'; end if;
  if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' then raise exception 'Please enter a valid email address'; end if;
  -- One request per address per 10 minutes; at most 30 an hour overall
  if exists (select 1 from public.demo_requests where email = v_email and created_at > now() - interval '10 minutes') then
    select id into v_id from public.demo_requests where email = v_email order by created_at desc limit 1;
    return v_id;
  end if;
  if (select count(*) from public.demo_requests where created_at > now() - interval '1 hour') >= 30 then
    raise exception 'We''re getting a lot of requests right now — please try again shortly';
  end if;
  insert into public.demo_requests (name, email, company, phone, business_type, team_size, message, source)
  values (left(trim(p_name), 120), left(v_email, 200), nullif(left(trim(coalesce(p_company, '')), 160), ''), nullif(left(trim(coalesce(p_phone, '')), 40), ''),
          nullif(left(trim(coalesce(p_business_type, '')), 80), ''), nullif(left(trim(coalesce(p_team_size, '')), 40), ''),
          nullif(left(trim(coalesce(p_message, '')), 2000), ''), nullif(left(coalesce(p_source, ''), 200), ''))
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.submit_demo_request(text, text, text, text, text, text, text, text) from public;
grant execute on function public.submit_demo_request(text, text, text, text, text, text, text, text) to anon, authenticated;

-- 0071 — Tags (folders) on enquiries, e.g. "Coffee Van" or "Espresso bar catering", and which Gmail account a
-- supplier's invoices arrive in (yours, or the second Gmail account). Run after 0070.

alter table public.enquiries add column if not exists tags text[] not null default '{}';
create index if not exists enquiries_tags on public.enquiries using gin (tags);

alter table if exists public.price_suppliers add column if not exists mailbox text not null default 'gmail';
do $$ begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'price_suppliers')
     and not exists (select 1 from pg_constraint where conname = 'price_suppliers_mailbox_check') then
    alter table public.price_suppliers add constraint price_suppliers_mailbox_check check (mailbox in ('gmail','gmail2'));
  end if;
end $$;

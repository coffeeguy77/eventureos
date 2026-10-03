-- =====================================================================
-- EventureOS 0045 — Business documents every customer can get
--   (public liability certificate, food licence, artwork templates for cart / machine wraps…)
-- A library document has no customer/event. Customers see current ones in their portal; ones marked
-- "public" are also on a shareable no-login page. Downloads go through the server (signed links).
-- =====================================================================
alter table public.documents add column if not exists library boolean not null default false;
alter table public.documents add column if not exists category text check (char_length(category) <= 60);
alter table public.documents add column if not exists description text check (char_length(description) <= 500);
alter table public.documents add column if not exists expires_on date;
alter table public.documents add column if not exists public_share boolean not null default false;
create index if not exists documents_library_idx on public.documents (organisation_id) where library;

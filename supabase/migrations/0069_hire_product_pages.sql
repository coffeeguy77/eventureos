-- 0069 — Hire product pages: photos, a web address, a longer write-up, search engine text, what to suggest with it,
-- and whether it shows in the online shop.

alter table public.hire_items add column if not exists images jsonb not null default '[]'::jsonb;   -- ["https://…", …] first = main photo
alter table public.hire_items add column if not exists slug text;                                     -- /hire/<business>/shop/<slug>
alter table public.hire_items add column if not exists details text;                                  -- the product page write-up (plain text, blank lines = paragraphs)
alter table public.hire_items add column if not exists specs jsonb not null default '[]'::jsonb;    -- [{label, value}] e.g. Size, Power
alter table public.hire_items add column if not exists related jsonb not null default '[]'::jsonb;  -- [item id, …] suggested on its page
alter table public.hire_items add column if not exists seo_title text;
alter table public.hire_items add column if not exists seo_description text;
alter table public.hire_items add column if not exists show_online boolean not null default true;

create unique index if not exists hire_items_slug on public.hire_items (organisation_id, slug) where slug is not null;

-- Existing photos become the first of the gallery
update public.hire_items set images = jsonb_build_array(image_url) where image_url is not null and images = '[]'::jsonb;

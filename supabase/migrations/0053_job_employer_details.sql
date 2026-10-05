-- =====================================================================
-- EventureOS 0053 — Barista job board: more about each business
--   job_employers.address / state / postcode : the business's street address (baristas see who they are and where)
--   job_employers.instagram                  : Instagram username (separate from the website)
--   job_employers.equipment                  : the coffee gear they use — [{ "type": "machine"|"grinder"|"other", "brand": "...", "model": "..." }]
-- Nothing existing is changed or removed. Safe to run more than once.
-- =====================================================================

alter table public.job_employers add column if not exists address   text check (char_length(address) <= 200);
alter table public.job_employers add column if not exists state     text check (char_length(state) <= 10);
alter table public.job_employers add column if not exists postcode  text check (postcode is null or postcode ~ '^[0-9]{4}$');
alter table public.job_employers add column if not exists instagram text check (instagram is null or instagram ~ '^[A-Za-z0-9._]{1,30}$');
alter table public.job_employers add column if not exists equipment jsonb not null default '[]'::jsonb check (jsonb_typeof(equipment) = 'array');

-- =====================================================================
-- EventureOS 0109 — Loan files: a link for each extra applicant
--   loan_applicant_links : applicant 2 (3, 4) gets their own private link to fill in their own details,
--                          tick their own consents and sign. Only they can sign for themselves.
-- The main link on loan_files stays applicant 1's. Safe to run more than once. Needs 0106.
-- =====================================================================
create table if not exists public.loan_applicant_links (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  file_id          uuid not null references public.loan_files(id) on delete cascade,
  applicant        integer not null check (applicant between 2 and 4),
  token            text not null unique check (char_length(token) between 20 and 80),
  email            text check (char_length(email) <= 254),
  sent_at          timestamptz,
  last_seen_at     timestamptz,
  created_at       timestamptz not null default now(),
  unique (file_id, applicant)
);
alter table public.loan_applicant_links enable row level security;
drop policy if exists loan_applicant_links_select on public.loan_applicant_links;
create policy loan_applicant_links_select on public.loan_applicant_links for select to authenticated using (public.is_org_staff(organisation_id));

-- Two people can fill in the same application at once: merge their answers in one step so neither overwrites the other.
create or replace function public.loan_merge_answers(p_file uuid, p_patch jsonb)
returns void language sql security definer set search_path = public as $$
  update public.loan_files set answers = coalesce(answers, '{}'::jsonb) || coalesce(p_patch, '{}'::jsonb), updated_at = now() where id = p_file;
$$;
revoke all on function public.loan_merge_answers(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.loan_merge_answers(uuid, jsonb) to service_role;

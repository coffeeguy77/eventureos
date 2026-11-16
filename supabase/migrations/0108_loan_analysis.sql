-- EventureOS 0108 — saves the latest financial-position analysis on a loan file (figures + the AI's assessment).
-- (Also at the end of 0107 — this is for databases where 0107 was run before it was added.) Safe to run more than once.
alter table public.loan_files add column if not exists analysis jsonb;

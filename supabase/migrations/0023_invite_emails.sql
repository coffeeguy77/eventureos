-- Invitation emails: when the last one went out (team) / when a client contact was invited to the portal
alter table public.organisation_invitations add column if not exists last_sent_at timestamptz;
alter table public.organisation_invitations add column if not exists send_count integer not null default 0;
alter table public.event_contacts add column if not exists invited_at timestamptz;

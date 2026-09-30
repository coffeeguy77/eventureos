-- Quotes can be emailed through the organisation's connected Gmail (from the business's own address)
-- instead of Resend. Resend stays for system emails and as the fallback when Gmail isn't connected.
alter table public.email_sends
  add column if not exists channel text not null default 'resend' check (channel in ('resend', 'gmail')),
  add column if not exists from_email text check (char_length(from_email) <= 254);

alter table public.email_send_recipients
  add column if not exists channel text not null default 'resend' check (channel in ('resend', 'gmail')),
  add column if not exists gmail_message_id text,
  add column if not exists gmail_thread_id text;

-- Bounce notices from Gmail land in the same Gmail thread as the message that bounced
create index if not exists email_send_recipients_gmail_thread_idx
  on public.email_send_recipients (organisation_id, gmail_thread_id) where gmail_thread_id is not null;

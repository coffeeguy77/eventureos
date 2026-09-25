-- Enquiries can arrive before they are matched to a customer (e.g. website
-- forms, unknown senders), so keep the raw contact details on the enquiry.
alter table public.enquiries
  add column contact_name  text,
  add column contact_email text,
  add column contact_phone text,
  add column company       text;

create index on public.enquiries (organisation_id, lower(contact_email));

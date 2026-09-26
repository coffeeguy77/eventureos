-- New organisations and calendars start with the EventureOS brand violet (matches the logo).
alter table public.organisations alter column brand_colour set default '#6028EC';
alter table public.calendar_connections alter column colour set default '#6028EC';

-- Display preferences (Personalise): appearance, accent, text size, contrast, motion — follows the person across devices
alter table public.users add column if not exists ui_prefs jsonb;

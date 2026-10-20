-- =====================================================================
-- 0063_learn.sql
--
-- Learn: the online barista course (moved from the Replit "Barista Course" app) — lessons and quizzes, XP, streaks,
-- badges, leaderboard, daily challenges, roast simulator, AI coach, the trainer manual, paid access (12 months with a
-- barista course, monthly, or yearly) and a training-room marketplace (venues Australia-wide list rooms for hire and
-- the business takes a commission).
--
-- Content (levels → modules → lessons, trainer manual) is per organisation so each business can run its own.
-- Learners are booking_students (the same email sign-in as "My bookings"); the server reads/writes their rows with
-- the service role — learners never query these tables directly. Staff manage everything under RLS.
--
-- New tables only; nothing existing is changed. Safe to run more than once.
-- =====================================================================

-- ---------------------------------------------------------------- curriculum
create table if not exists public.learn_levels (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  key             text not null check (char_length(key) between 1 and 40),
  number          integer not null default 1,
  title           text not null check (char_length(title) between 1 and 200),
  description     text check (description is null or char_length(description) <= 2000),
  min_xp          integer not null default 0 check (min_xp >= 0),
  xp_reward       integer not null default 0 check (xp_reward >= 0),
  certificate_title text check (certificate_title is null or char_length(certificate_title) <= 200),
  certificate_text  text check (certificate_text is null or char_length(certificate_text) <= 2000),
  published       boolean not null default true,
  position        integer not null default 0,
  created_at      timestamptz not null default now(),
  unique (organisation_id, key)
);

create table if not exists public.learn_modules (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  level_id        uuid not null references public.learn_levels(id) on delete cascade,
  key             text not null check (char_length(key) between 1 and 40),
  title           text not null check (char_length(title) between 1 and 200),
  description     text check (description is null or char_length(description) <= 2000),
  xp_reward       integer not null default 0 check (xp_reward >= 0),
  published       boolean not null default true,
  position        integer not null default 0,
  created_at      timestamptz not null default now(),
  unique (organisation_id, key)
);
create index if not exists learn_modules_level_idx on public.learn_modules (level_id, position);

create table if not exists public.learn_lessons (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  module_id        uuid not null references public.learn_modules(id) on delete cascade,
  key              text not null check (char_length(key) between 1 and 40),
  title            text not null check (char_length(title) between 1 and 200),
  duration_minutes integer not null default 5 check (duration_minutes between 1 and 600),
  xp_reward        integer not null default 10 check (xp_reward >= 0),
  content          text not null default '' check (char_length(content) <= 60000),  -- simple Markdown (##, ###, -, tables, >)
  key_points       jsonb not null default '[]'::jsonb,                                -- ["…", …]
  quiz             jsonb,                                                             -- { question, options[], correct_index, explanation }
  published        boolean not null default true,
  position         integer not null default 0,
  updated_at       timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  unique (organisation_id, key)
);
create index if not exists learn_lessons_module_idx on public.learn_lessons (module_id, position);

-- Badges and daily challenges (rule = what earns the badge; see lib/learn/core.ts)
create table if not exists public.learn_badges (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  key             text not null check (char_length(key) between 1 and 40),
  name            text not null check (char_length(name) between 1 and 120),
  description     text check (description is null or char_length(description) <= 500),
  icon            text check (icon is null or char_length(icon) <= 40),
  rule            jsonb not null default '{}'::jsonb,   -- { kind: lessons|streak|level|roast|challenges|art|module_day|manual, value }
  active          boolean not null default true,
  position        integer not null default 0,
  unique (organisation_id, key)
);

create table if not exists public.learn_challenges (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  key             text not null check (char_length(key) between 1 and 40),
  title           text not null check (char_length(title) between 1 and 200),
  description     text check (description is null or char_length(description) <= 1000),
  xp_reward       integer not null default 25 check (xp_reward >= 0),
  active          boolean not null default true,
  position        integer not null default 0,
  unique (organisation_id, key)
);

-- Trainer manual: modules, lessons, course timelines, theory questions, rubrics (each item's fields in data)
create table if not exists public.learn_trainer_items (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  kind            text not null check (kind in ('module','lesson','timeline_4hr','timeline_2hr','theory','rubric_practical','rubric_teaching')),
  key             text not null check (char_length(key) between 1 and 40),
  parent_key      text,
  position        integer not null default 0,
  data            jsonb not null default '{}'::jsonb,
  unique (organisation_id, kind, key)
);

-- ---------------------------------------------------------------- learners
create table if not exists public.learn_learners (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  student_id      uuid not null references public.booking_students(id) on delete cascade,
  display_name    text check (display_name is null or char_length(display_name) <= 80),
  xp              integer not null default 0 check (xp >= 0),
  streak_days     integer not null default 0 check (streak_days >= 0),
  best_streak     integer not null default 0 check (best_streak >= 0),
  last_active_on  date,
  coach_style     text not null default 'mentor' check (coach_style in ('mentor','strict','funny')),
  on_leaderboard  boolean not null default true,
  best_art        integer not null default 0 check (best_art between 0 and 100),   -- best latte-art photo score
  created_at      timestamptz not null default now(),
  unique (organisation_id, student_id)
);
create index if not exists learn_learners_xp_idx on public.learn_learners (organisation_id, xp desc);

create table if not exists public.learn_progress (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  student_id      uuid not null references public.booking_students(id) on delete cascade,
  lesson_id       uuid not null references public.learn_lessons(id) on delete cascade,
  xp_awarded      integer not null default 0,
  completed_at    timestamptz not null default now(),
  unique (student_id, lesson_id)
);
create index if not exists learn_progress_student_idx on public.learn_progress (organisation_id, student_id);

create table if not exists public.learn_quiz_attempts (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  student_id      uuid not null references public.booking_students(id) on delete cascade,
  module_id       uuid not null references public.learn_modules(id) on delete cascade,
  score           integer not null check (score >= 0),
  out_of          integer not null check (out_of > 0),
  passed          boolean not null,
  created_at      timestamptz not null default now()
);
create index if not exists learn_quiz_attempts_idx on public.learn_quiz_attempts (student_id, module_id);

create table if not exists public.learn_badge_awards (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  student_id      uuid not null references public.booking_students(id) on delete cascade,
  badge_key       text not null,
  awarded_at      timestamptz not null default now(),
  unique (student_id, badge_key)
);

create table if not exists public.learn_challenge_done (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  student_id      uuid not null references public.booking_students(id) on delete cascade,
  challenge_id    uuid not null references public.learn_challenges(id) on delete cascade,
  done_on         date not null,
  note            text check (note is null or char_length(note) <= 1000),
  unique (student_id, challenge_id, done_on)
);

create table if not exists public.learn_roasts (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  student_id      uuid not null references public.booking_students(id) on delete cascade,
  name            text check (name is null or char_length(name) <= 120),
  history         jsonb not null default '[]'::jsonb,   -- [{ time, bt, ror }]
  first_crack_s   integer,
  drop_s          integer,
  score           numeric(4,1),
  issues          jsonb not null default '[]'::jsonb,
  created_at      timestamptz not null default now()
);
create index if not exists learn_roasts_student_idx on public.learn_roasts (student_id, created_at desc);

-- AI coach use per learner per day (to cap cost)
create table if not exists public.learn_ai_usage (
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  student_id      uuid not null references public.booking_students(id) on delete cascade,
  day             date not null,
  messages        integer not null default 0,
  photos          integer not null default 0,
  primary key (student_id, day)
);

-- ---------------------------------------------------------------- paid access
-- plan: with_course (12 months, bought with a barista course), monthly (renews each month on the saved card),
--       yearly (12 months), comp (given free by the office)
create table if not exists public.learn_access (
  id                     uuid primary key default gen_random_uuid(),
  organisation_id        uuid not null references public.organisations(id) on delete cascade,
  student_id             uuid not null references public.booking_students(id) on delete cascade,
  plan                   text not null check (plan in ('with_course','monthly','yearly','comp')),
  status                 text not null default 'pending' check (status in ('pending','active','payment_failed','cancelled','expired')),
  price                  numeric(10,2) not null default 0 check (price >= 0),
  currency               text not null default 'AUD',
  starts_at              timestamptz,
  ends_at                timestamptz,
  renews                 boolean not null default false,
  booking_id             uuid references public.bookings(id) on delete set null,
  stripe_session_id      text,
  stripe_payment_intent  text,
  stripe_customer_id     text,
  stripe_payment_method  text,
  card_label             text,
  failed_attempts        integer not null default 0,
  last_error             text,
  note                   text check (note is null or char_length(note) <= 1000),
  cancelled_at           timestamptz,
  created_at             timestamptz not null default now()
);
create index if not exists learn_access_student_idx on public.learn_access (organisation_id, student_id, status);
create index if not exists learn_access_renew_idx on public.learn_access (status, renews, ends_at);

create table if not exists public.learn_payments (
  id                     uuid primary key default gen_random_uuid(),
  organisation_id        uuid not null references public.organisations(id) on delete cascade,
  access_id              uuid not null references public.learn_access(id) on delete cascade,
  amount                 numeric(10,2) not null,
  currency               text not null default 'AUD',
  kind                   text not null check (kind in ('first','renewal')),
  stripe_payment_intent  text,
  paid_at                timestamptz not null default now(),
  unique (stripe_payment_intent)
);

-- ---------------------------------------------------------------- training-room marketplace
create table if not exists public.learn_venues (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  name            text not null check (char_length(name) between 1 and 160),
  business_name   text check (business_name is null or char_length(business_name) <= 160),
  contact_name    text check (contact_name is null or char_length(contact_name) <= 160),
  email           text check (email is null or char_length(email) <= 200),
  phone           text check (phone is null or char_length(phone) <= 40),
  address         text check (address is null or char_length(address) <= 300),
  suburb          text check (suburb is null or char_length(suburb) <= 120),
  state           text check (state is null or state in ('ACT','NSW','NT','QLD','SA','TAS','VIC','WA')),
  postcode        text check (postcode is null or postcode ~ '^\d{4}$'),
  capacity        integer check (capacity is null or capacity between 1 and 500),
  description     text check (description is null or char_length(description) <= 4000),
  equipment       text check (equipment is null or char_length(equipment) <= 2000),
  image_url       text check (image_url is null or char_length(image_url) <= 1000),
  hourly_rate     numeric(10,2) check (hourly_rate is null or hourly_rate >= 0),
  day_rate        numeric(10,2) check (day_rate is null or day_rate >= 0),
  commission_pct  numeric(5,2) not null default 15 check (commission_pct between 0 and 100),
  status          text not null default 'pending' check (status in ('pending','approved','hidden')),
  listing_paid_until date,
  manage_token    text not null default encode(extensions.gen_random_bytes(24), 'hex') unique,
  office_note     text check (office_note is null or char_length(office_note) <= 2000),
  created_at      timestamptz not null default now()
);
create index if not exists learn_venues_org_idx on public.learn_venues (organisation_id, status);

create table if not exists public.learn_venue_bookings (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  venue_id        uuid not null references public.learn_venues(id) on delete cascade,
  name            text not null check (char_length(name) between 1 and 160),
  email           text not null check (char_length(email) <= 200),
  phone           text check (phone is null or char_length(phone) <= 40),
  wanted_on       date,
  hours           numeric(5,2) check (hours is null or hours > 0),
  people          integer check (people is null or people between 1 and 500),
  message         text check (message is null or char_length(message) <= 2000),
  amount          numeric(10,2) check (amount is null or amount >= 0),       -- what the hirer pays
  commission      numeric(10,2) check (commission is null or commission >= 0), -- the business's cut
  status          text not null default 'enquiry' check (status in ('enquiry','confirmed','paid','cancelled')),
  pay_token       text not null default encode(extensions.gen_random_bytes(24), 'hex') unique,
  stripe_session_id     text,
  stripe_payment_intent text,
  paid_at         timestamptz,
  venue_paid_at   timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists learn_venue_bookings_idx on public.learn_venue_bookings (organisation_id, status, created_at desc);

-- ---------------------------------------------------------------- security
do $$
declare t text;
begin
  foreach t in array array['learn_levels','learn_modules','learn_lessons','learn_badges','learn_challenges','learn_trainer_items',
    'learn_learners','learn_progress','learn_quiz_attempts','learn_badge_awards','learn_challenge_done','learn_roasts','learn_ai_usage',
    'learn_access','learn_payments','learn_venues','learn_venue_bookings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_org_staff(organisation_id))', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_org_manager(organisation_id))', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_org_manager(organisation_id)) with check (public.is_org_manager(organisation_id))', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_org_manager(organisation_id))', t || '_delete', t);
  end loop;
end $$;

-- Award XP once per lesson and keep the streak (called by the server for a signed-in learner)
create or replace function public.learn_complete_lesson(p_org uuid, p_student uuid, p_lesson uuid, p_today date)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_xp integer; v_new boolean; v_last date; v_streak integer;
begin
  select xp_reward into v_xp from public.learn_lessons where id = p_lesson and organisation_id = p_org;
  if v_xp is null then raise exception 'Lesson not found'; end if;
  insert into public.learn_learners (organisation_id, student_id) values (p_org, p_student) on conflict (organisation_id, student_id) do nothing;
  insert into public.learn_progress (organisation_id, student_id, lesson_id, xp_awarded) values (p_org, p_student, p_lesson, v_xp)
    on conflict (student_id, lesson_id) do nothing;
  get diagnostics v_new = row_count;
  select last_active_on, streak_days into v_last, v_streak from public.learn_learners where organisation_id = p_org and student_id = p_student for update;
  update public.learn_learners set
    xp = xp + case when v_new then v_xp else 0 end,
    streak_days = case when v_last = p_today then v_streak when v_last = p_today - 1 then v_streak + 1 else 1 end,
    best_streak = greatest(best_streak, case when v_last = p_today then v_streak when v_last = p_today - 1 then v_streak + 1 else 1 end),
    last_active_on = p_today
  where organisation_id = p_org and student_id = p_student;
  return case when v_new then v_xp else 0 end;
end $$;
revoke all on function public.learn_complete_lesson(uuid, uuid, uuid, date) from public, anon, authenticated;
grant execute on function public.learn_complete_lesson(uuid, uuid, uuid, date) to service_role;

-- Add XP for other things (daily challenges, mastery quizzes, the roast simulator) and keep the streak
create or replace function public.learn_add_xp(p_org uuid, p_student uuid, p_xp integer, p_today date)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_last date; v_streak integer; v_total integer;
begin
  insert into public.learn_learners (organisation_id, student_id) values (p_org, p_student) on conflict (organisation_id, student_id) do nothing;
  select last_active_on, streak_days into v_last, v_streak from public.learn_learners where organisation_id = p_org and student_id = p_student for update;
  update public.learn_learners set
    xp = xp + greatest(0, coalesce(p_xp, 0)),
    streak_days = case when v_last = p_today then v_streak when v_last = p_today - 1 then v_streak + 1 else 1 end,
    best_streak = greatest(best_streak, case when v_last = p_today then v_streak when v_last = p_today - 1 then v_streak + 1 else 1 end),
    last_active_on = p_today
  where organisation_id = p_org and student_id = p_student
  returning xp into v_total;
  return v_total;
end $$;
revoke all on function public.learn_add_xp(uuid, uuid, integer, date) from public, anon, authenticated;
grant execute on function public.learn_add_xp(uuid, uuid, integer, date) to service_role;

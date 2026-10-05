-- =====================================================================
-- Bean Culture — booking page content, course photos, and tidy-up of the old $0 course
-- Run once in the Supabase SQL Editor. Only touches Bean Culture's courses and booking settings.
--   1. Moves the one old class (21 Dec 2024, 6 people, 5 certificates) from the hidden $0
--      "Looking For Work Course" into "Looking For Work Course (4hr)", then deletes the empty $0 course.
--   2. Course photos, summaries, descriptions, location and what to bring.
--   3. Booking page wording (search title/description, headline, highlights, sections), FAQs and booking terms.
-- Everything here can be edited afterwards in Bookings → Courses and Bookings → Website & settings.
-- =====================================================================

do $$
declare
  o    uuid := '56fbec7d-ff7b-4481-8b48-fd1bd1894fde';   -- Bean Culture
  dead uuid := 'd95fcd85-7248-45a7-9fd7-264ed4fbb2cb';   -- "Looking For Work Course" ($0, hidden)
  work uuid := 'f1bd855e-4fab-45af-a6e1-c271a1730d97';   -- "Looking For Work Course (4hr)"
  home uuid := '5fba2415-ef59-41cc-b8a2-cec5928c80a4';   -- "Home Barista Course (2hr)"
  where_ text := 'U5, 47-49 Vicars Street, Mitchell ACT 2911';
  bring text := 'Just yourself. We supply the coffee and milk. Skip the white shoes, it can get messy!';
begin
  -- 1. The old $0 course → its class joins the 4hr course (history and certificates kept)
  if exists (select 1 from booking_courses where id = dead and organisation_id = o) then
    update booking_sessions     set course_id = work where course_id = dead and organisation_id = o;
    update bookings             set course_id = work where course_id = dead and organisation_id = o;
    update booking_certificates set course_id = work where course_id = dead and organisation_id = o;
    -- the Bookly sync files that old service name under the 4hr course from now on
    update booking_courses set external_names = (select array_agg(distinct x) from unnest(external_names || array['name:looking for work course', 'Looking For Work Course']) x)
      where id = work and organisation_id = o;
    delete from booking_courses where id = dead and organisation_id = o
      and not exists (select 1 from bookings where course_id = dead) and not exists (select 1 from booking_sessions where course_id = dead);
  end if;

  -- 2. Courses
  update booking_courses set
    image_url = 'https://www.eventureos.com.au/media/beanculture/home-barista-course.jpg',
    summary = 'Make café-quality coffee at home: grinder tuning, espresso, milk texturing and your first latte art.',
    description = E'Saturdays, 2:30pm – 4:30pm.\n\nWe dial in the grinder with you rather than before you arrive, then cover coffee recipes, milk texturing, and pouring a heart and a tulip.\n\nYou also take home a bag of beans fresh from our roastery.',
    location = where_, what_to_bring = bring
  where id = home and organisation_id = o;

  update booking_courses set
    image_url = 'https://www.eventureos.com.au/media/beanculture/looking-for-work-barista-course.jpg',
    summary = 'Everything you need to start work as a café barista, from opening to closing.',
    description = E'Saturdays, 10am – 2pm.\n\nLearn how a working café runs: opening and closing, dialling in the grinder, consistent espresso, milk texturing and latte art, and keeping up when it gets busy. You''ll know what employers expect before your first shift.\n\nAfterwards you can join Bean Culture Barista Jobs, where Canberra cafés look for trained baristas.',
    location = where_, what_to_bring = bring
  where id = work and organisation_id = o;

  -- 3. Booking page wording, FAQs and terms
  update organisations set settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{booking}', coalesce(settings->'booking', '{}'::jsonb) || jsonb_build_object(
    'intro', 'Learn from the roasters at Bean Culture in Mitchell. Two hands-on Saturday courses: one for great coffee at home, one to get you job-ready.',
    'terms', 'All courses are non-refundable for change of mind. You''re welcome to change your course date up to 5 days before your booked lesson, to a new date with availability. If you can''t attend, you can gift your spot to someone else. If Bean Culture cancels a course, you can choose a full refund or a new date.',
    'faqs', jsonb_build_array(
      jsonb_build_object('q', 'Is a barista course worth it?', 'a', 'You don''t need a course to become a barista, but it gets you there much faster. After coaching hundreds of people, we see the same thing: a few focused hours with a trainer gives you the skills and confidence that take months to pick up on your own.'),
      jsonb_build_object('q', 'Can''t I just learn on the job?', 'a', 'Cafés rarely hire people who have never made a coffee. They want staff who already understand the grinder, espresso and milk. The Looking For Work Course gets you there, and you can then join Bean Culture Barista Jobs, where Canberra cafés find trained baristas.'),
      jsonb_build_object('q', 'Which course should I choose?', 'a', 'If you want to work in a café or at events, choose the Looking For Work Course (4 hours). If you want to make better coffee at home or get a simple introduction, the Home Barista Course (2 hours) is perfect.'),
      jsonb_build_object('q', 'Do I get a certificate?', 'a', 'Yes. Everyone who completes a course gets a digital certificate with their name on it, ready to add to a resume or job application.'),
      jsonb_build_object('q', 'What do I need to bring?', 'a', 'Just yourself. We supply fresh, locally roasted coffee and as much milk as you need. It can get messy, so maybe skip the white shoes!'),
      jsonb_build_object('q', 'Where are you?', 'a', 'Our roastery is at U5, 47-49 Vicars Street, Mitchell ACT. If you get lost, just give us a call.'),
      jsonb_build_object('q', 'Can I change my date?', 'a', 'Yes. You can move your booking to another date with availability up to 5 days before your course, online from your confirmation email, or give your spot to someone else.')
    ),
    'landing', jsonb_build_object(
      'title', 'Barista Courses Canberra | Bean Culture Coffee Roasters',
      'description', 'Small-group barista courses at our Mitchell roastery in Canberra. Home Barista (2 hrs, $150) or Looking For Work (4 hrs, $300). Digital certificate. Book online.',
      'headline', 'Barista courses in Canberra',
      'heroImage', 'https://www.eventureos.com.au/media/beanculture/looking-for-work-barista-course.jpg',
      'highlights', jsonb_build_array('Small groups, hands-on', 'Digital certificate', 'Free roastery tour', 'Saturdays in Mitchell'),
      'sections', jsonb_build_array(
        jsonb_build_object('heading', 'Why do a barista course?', 'body', E'Coffee is a big part of life in Canberra, and cafés want staff who already know their way around a machine. A barista course is the quickest way to get there.\n\nWhether you''re a uni student after casual work, changing careers into hospitality, or just want a better coffee at home, a few hours of hands-on training with a roaster makes the difference.'),
        jsonb_build_object('heading', 'Which course is right for me?', 'body', E'Looking For Work (4 hours, $300) is for anyone who wants a job in a café or at events. It covers what employers expect, from opening to closing.\n\nHome Barista (2 hours, $150) is for people who want great coffee at home: grinder tuning, espresso, recipes, milk and basic latte art.'),
        jsonb_build_object('heading', 'What you''ll learn', 'body', E'We don''t pre-set the grinder before you arrive. We tune it with you until 21g of coffee pours in about 25 seconds, and explain why weighing every shot matters and what happens when the basket is over- or under-filled.\n\nThen it''s milk: texturing and stretching, then pouring a heart, then a tulip.'),
        jsonb_build_object('heading', 'Training in a working roastery', 'body', E'Our courses run at the Bean Culture roastery in Mitchell, where we roast the coffee you''ll be using. Classes are small, so your trainer''s attention stays on you.\n\nEvery course finishes with a digital certificate, and there''s a free roastery tour included.')
      )
    )
  )), updated_at = now()
  where id = o;
end $$;

-- Check: two courses with photos, and the page wording in place
select name, price, public, image_url is not null as has_photo,
  (select count(*) from bookings b where b.course_id = c.id) as bookings
from booking_courses c where organisation_id = '56fbec7d-ff7b-4481-8b48-fd1bd1894fde' order by position;

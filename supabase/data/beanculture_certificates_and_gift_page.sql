-- =====================================================================
-- Bean Culture — certificates that match your four mockups, and the new gift page (run once in the Supabase SQL Editor)
-- Adds your mockup artwork to the four new styles (Photo panel, Botanical, Poster, Elegant), plus wording and
-- the skills for each course. It does NOT change the style you're using now: pick one in Bookings → Certificates
-- and press Save design. Your signature, colours and other settings are kept. Safe to run more than once.
-- =====================================================================
update booking_certificate_templates set design = design || jsonb_build_object(
  'subtitle', 'This certifies that',
  'eyebrow', 'Barista training',
  'tagline', 'Bean Culture Coffee Roastery · Canberra',
  'hoursLine', '{hours} practical training',
  'sealText', 'Certified',
  'sealTop', '{business}',
  'sealBottom', 'Barista',
  'panelTitle', 'Barista training',
  'panelWords', E'Coffee\nPeople\nSkills\nOpportunities',
  'photo', 'https://www.eventureos.com.au/media/beanculture/looking-for-work-barista-course.jpg',
  'arts', jsonb_build_object(
    'latte', 'https://www.eventureos.com.au/media/beanculture/certificate-photo-panel.jpg',
    'botanical', 'https://www.eventureos.com.au/media/beanculture/certificate-botanical.jpg',
    'poster', 'https://www.eventureos.com.au/media/beanculture/certificate-poster.jpg',
    'elegant', 'https://www.eventureos.com.au/media/beanculture/certificate-elegant.jpg'
  ),
  'skills', jsonb_build_object(
    'f1bd855e-4fab-45af-a6e1-c271a1730d97', jsonb_build_array('Espresso extraction', 'Milk texturing', 'Grinder calibration', 'Workflow & service', 'Cleaning & maintenance'),
    '5fba2415-ef59-41cc-b8a2-cec5928c80a4', jsonb_build_array('Grinder & dosing', 'Espresso extraction', 'Milk texturing', 'Latte art', 'Cleaning & care')
  )
), updated_at = now()
where organisation_id = '56fbec7d-ff7b-4481-8b48-fd1bd1894fde';

-- Gift page: background picture and the small heading above "Give a class as a gift"
update organisations set settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{booking,landing}',
  coalesce(settings->'booking'->'landing', '{}'::jsonb)
  || jsonb_build_object('giftHero', 'https://www.eventureos.com.au/media/beanculture/gift-hero.jpg')
  || jsonb_build_object('copy', coalesce(settings->'booking'->'landing'->'copy', '{}'::jsonb) || jsonb_build_object('giftPageEyebrow', 'Barista training'))
), updated_at = now()
where id = '56fbec7d-ff7b-4481-8b48-fd1bd1894fde' and settings ? 'booking';

-- Check
select design->>'style' as style, design->>'tagline' as tagline, jsonb_object_keys(design->'skills') as course_with_skills
from booking_certificate_templates where organisation_id = '56fbec7d-ff7b-4481-8b48-fd1bd1894fde';

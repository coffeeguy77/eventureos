-- =====================================================================
-- Bean Culture — certificate wording for the new styles (run once in the Supabase SQL Editor)
-- Only adds wording and skills to Bean Culture's certificate design. It does NOT change the style
-- you're using now: pick a new style in Bookings → Certificates and press Save design when you're happy.
-- Your signature, colours and settings are kept.
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
  'skills', jsonb_build_object(
    'f1bd855e-4fab-45af-a6e1-c271a1730d97', jsonb_build_array('Espresso extraction', 'Milk texturing', 'Grinder calibration', 'Workflow & service', 'Cleaning & maintenance'),
    '5fba2415-ef59-41cc-b8a2-cec5928c80a4', jsonb_build_array('Grinder & dosing', 'Espresso extraction', 'Milk texturing', 'Latte art', 'Cleaning & care')
  )
), updated_at = now()
where organisation_id = '56fbec7d-ff7b-4481-8b48-fd1bd1894fde';

-- Check
select design->>'style' as style, design->>'tagline' as tagline, jsonb_object_keys(design->'skills') as course_with_skills
from booking_certificate_templates where organisation_id = '56fbec7d-ff7b-4481-8b48-fd1bd1894fde';

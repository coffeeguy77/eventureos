-- Bean Culture — photo behind the top of the new Barista Jobs page (run once in the Supabase SQL Editor)
update organisations set settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{jobs}',
  coalesce(settings->'jobs', '{}'::jsonb) || jsonb_build_object('heroImage', 'https://www.eventureos.com.au/media/beanculture/jobs-hero.jpg')
), updated_at = now()
where id = '56fbec7d-ff7b-4481-8b48-fd1bd1894fde';

select settings->'jobs'->>'heroImage' as hero from organisations where id = '56fbec7d-ff7b-4481-8b48-fd1bd1894fde';

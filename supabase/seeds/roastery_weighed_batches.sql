-- Optional, run AFTER 0098_roastery.sql: adds Bean Culture's 8 weighed 30 kg batches (3 Nov 2026)
-- so the weight-loss figures start from real data. Green stock is NOT reduced (they were roasted before tracking).
with org as (select id from public.organisations where slug = 'beanculture'),
c as (
  insert into public.roastery_coffees (organisation_id, name, batch_kg)
  select org.id, x.name, 30 from org, (values ('Brazil'), ('PNG'), ('Colombia (blend)')) as x(name)
  on conflict (organisation_id, name) do nothing
  returning id, name
),
allc as (
  select id, name from c
  union select rc.id, rc.name from public.roastery_coffees rc, org where rc.organisation_id = org.id and rc.name in ('Brazil', 'PNG', 'Colombia (blend)')
)
insert into public.roastery_roasts (organisation_id, coffee_id, roasted_at, green_kg, roasted_kg, source)
select org.id, allc.id, '2026-11-03 12:00+11', 30, w.kg, 'weighed_list'
from org, allc join (values ('Brazil', 25.80), ('Brazil', 25.95), ('Brazil', 25.95), ('Brazil', 25.95),
                            ('PNG', 25.85), ('PNG', 25.30), ('Colombia (blend)', 24.55), ('Colombia (blend)', 24.80)) as w(name, kg) on w.name = allc.name;

-- Three more cities of the US office (Raju, 2026-11-06), needed by the staff
-- import: smaller than the Census list loaded in 20261021150000_us_big_cities.sql.
-- They are cities of the US office (like Austin), not offices. Existing
-- cities are kept; nothing is duplicated. Audited as office.cities_loaded.

with added as (
  insert into public.office_cities (office_id, region_id, name)
  select o.id, r.id, c.city
  from (values
    ('California', 'Rancho Mission Viejo'),
    ('Massachusetts', 'South Easton'),
    ('New York', 'Manlius')
  ) as c (state, city)
  join public.country_regions r on r.country = 'US' and r.name = c.state
  cross join public.offices o
  where o.name = 'US' and o.country = 'US'
    and not exists (
      select 1 from public.office_cities x
      where x.office_id = o.id and x.region_id = r.id and lower(x.name) = lower(c.city))
  returning name
)
select private.write_audit('office.cities_loaded', 'office',
  (select id::text from public.offices where name = 'US' and country = 'US'),
  jsonb_build_object('source', 'Raju 2026-11-06 (staff import)',
    'cities', (select coalesce(jsonb_agg(name order by name), '[]'::jsonb) from added)));

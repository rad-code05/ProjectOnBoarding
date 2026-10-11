-- Catalog: ten more applications from Laine's vendor list (asked by Raju,
-- 2026-10-11). Permission names are sensible defaults; the admin can rename
-- or retire them in Admin · Applications (F19).
insert into public.catalog_apps (category_id, name, actions, permissions, sort_order)
select c.id, a.name, '{Grant,Modify,Remove}'::text[], a.permissions, a.sort_order
from (values
  ('Core business', 'Confluence', '{User,Admin}'::text[], 110),
  ('Core business', 'Adobe',      '{User,Admin}',         120),
  ('Engineering, cloud & data', 'Cursor',   '{Member,Admin}',            80),
  ('Engineering, cloud & data', 'Graphite', '{Member,Admin}',            90),
  ('Engineering, cloud & data', 'Sentry',   '{Member,Admin}',           100),
  ('Engineering, cloud & data', 'GoDaddy',  '{DNS,Admin}',              110),
  ('Security, device & identity', 'Acronis',    '{User,Admin}',          50),
  ('Security, device & identity', 'Avanan',     '{User,Admin}',          60),
  ('Security, device & identity', 'HostedScan', '{User,Admin}',          70),
  ('Business, finance & operations', 'Stripe', '{Viewer,Developer,Admin}', 80)
) as a (category, name, permissions, sort_order)
join public.catalog_categories c on c.name = a.category;

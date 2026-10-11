-- Catalog: Zoom and Excalidraw (asked by Raju, 2026-10-11). The catalog is
-- data, not code; until the Admin · Applications screen (F19) exists, new
-- applications arrive as small seed migrations like this one.
insert into public.catalog_apps (category_id, name, actions, permissions, sort_order)
select c.id, a.name, a.actions, a.permissions, a.sort_order
from (values
  ('Core business', 'Zoom',       '{Grant,Modify,Remove}'::text[], '{Basic,Licensed,Admin}'::text[], 90),
  ('Core business', 'Excalidraw', '{Grant,Modify,Remove}',         '{Member,Admin}',                 100)
) as a (category, name, actions, permissions, sort_order)
join public.catalog_categories c on c.name = a.category;

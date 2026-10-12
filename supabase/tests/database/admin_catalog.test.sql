-- Admin · Applications, Equipment & access types (F19a): only an admin
-- changes the lists, through checked, audited functions; nothing is deleted;
-- old requests keep the names they copied. Run: pnpm db:test
begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

insert into public.app_users (clerk_user_id, email, first_name, last_name) values
  ('user_ac_admin', 'ac-admin@example.test', 'Ada', 'Admin'),
  ('user_ac_abe',   'ac-abe@example.test',   'Abe', 'Approver');
insert into public.user_roles (clerk_user_id, role) values
  ('user_ac_admin', 'admin'), ('user_ac_admin', 'requester'), ('user_ac_admin', 'it_operator'),
  ('user_ac_abe', 'approver');
insert into public.requests (created_by, first_name) values ('user_ac_admin', 'Nora');

set local role authenticated;

-- ---------------------------------------------------------------------------
-- Who
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"user_ac_abe","role":"authenticated"}', true);
select throws_ok(
  $$select public.admin_save_app(null, (select id from public.catalog_categories where name = 'Core business'), 'Notion', '{Grant}', '{Member}')$$,
  '42501', 'only an admin changes the lists', 'an approver cannot add an application');
select throws_ok(
  $$insert into public.catalog_apps (category_id, name, actions, permissions) values (1, 'X', '{Grant}', '{User}')$$,
  '42501', null, 'nobody writes the catalog table directly');

-- ---------------------------------------------------------------------------
-- Applications
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"user_ac_admin","role":"authenticated"}', true);
create temporary table ids (k text primary key, id smallint);
grant all on ids to authenticated;

insert into ids values ('notion', public.admin_save_app(null,
  (select id from public.catalog_categories where name = 'Core business'),
  '  Notion  ', '{Remove,Grant}', '{ Member , Admin, member, ""}'));
select ok(
  (select name = 'Notion' and actions = '{Grant,Remove}' and permissions = '{Member,Admin}' and active
   from public.catalog_apps where id = (select id from ids where k = 'notion')),
  'an admin adds an application: name trimmed, actions in order, options cleaned');
select ok(
  (select sort_order > (select max(sort_order) from public.catalog_apps a
                        where a.category_id = c.category_id and a.id <> c.id)
   from public.catalog_apps c where id = (select id from ids where k = 'notion')),
  'a new application goes to the end of its category');
select throws_ok(
  $$select public.admin_save_app(null, (select id from public.catalog_categories where name = 'Core business'), 'notion', '{Grant}', '{User}')$$,
  '23505', 'an application called notion already exists', 'names are unique, ignoring case');
select throws_ok(
  $$select public.admin_save_app(null, (select id from public.catalog_categories where name = 'Core business'), 'Linear', '{Grant,Issue}', '{User}')$$,
  '23514', null, 'only Grant / Modify / Remove / Enroll / Disable');
select throws_ok(
  $$select public.admin_save_app(null, (select id from public.catalog_categories where name = 'Core business'), 'Linear', '{}', '{User}')$$,
  '23514', 'choose at least one action', 'at least one action');
select throws_ok(
  $$select public.admin_save_app(null, (select id from public.catalog_categories where name = 'Core business'), 'Linear', '{Grant}', '{" "}')$$,
  '23514', 'add 1–12 permission options', 'at least one permission option');
select throws_ok(
  $$select public.admin_save_app(null, (select id from public.catalog_categories where name = 'Core business'), repeat('x', 81), '{Grant}', '{User}')$$,
  '23514', 'an application needs a name of 1–80 characters', 'names are 1–80 characters');

-- A request uses Notion; then the admin renames it and moves it.
insert into public.request_access_items (request_id, app_id, action, permission)
select r.id, i.id, 'Grant', 'Member'
from public.requests r, ids i where r.first_name = 'Nora' and i.k = 'notion';
select lives_ok(
  $$select public.admin_save_app((select id from ids where k = 'notion'),
    (select id from public.catalog_categories where name = 'Engineering, cloud & data'),
    'Notion Team', '{Grant,Modify,Remove}', '{Member,Admin,Guest}')$$,
  'an admin renames, moves and changes an application');
select is(
  (select app_name from public.request_access_items
   where app_id = (select id from ids where k = 'notion')),
  'Notion', 'the request keeps the name it copied when the app was chosen');
select lives_ok(
  $$select public.admin_save_app((select id from ids where k = 'notion'),
    (select id from public.catalog_categories where name = 'Engineering, cloud & data'),
    'Notion Team', '{Grant,Modify,Remove}', '{Member,Admin,Guest}')$$,
  'saving without a change is fine');

select lives_ok($$select public.admin_set_app_active((select id from ids where k = 'notion'), false)$$,
  'an admin retires an application');
select is((select active from public.catalog_apps where id = (select id from ids where k = 'notion')),
  false, 'retired = inactive, never deleted');
select throws_ok(
  $$insert into public.request_access_items (request_id, app_id, action, permission)
    select r.id, i.id, 'Grant', 'Admin' from public.requests r, ids i
    where r.first_name = 'Nora' and i.k = 'notion'$$,
  null, null, 'a retired application cannot be added to a request');
select lives_ok($$select public.admin_set_app_active((select id from ids where k = 'notion'), true)$$,
  'and restores it');

-- ---------------------------------------------------------------------------
-- Categories
-- ---------------------------------------------------------------------------
insert into ids values ('collab', public.admin_save_category(null, 'Collaboration'));
select is((select name from public.catalog_categories where id = (select id from ids where k = 'collab')),
  'Collaboration', 'an admin adds a category');
select throws_ok($$select public.admin_save_category(null, 'core BUSINESS')$$,
  '23505', null, 'category names are unique, ignoring case');
select throws_ok(
  $$select public.admin_set_category_active((select id from public.catalog_categories where name = 'Core business'), false)$$,
  '23514', 'move or retire its applications first', 'a category with active applications stays');
select lives_ok($$select public.admin_set_category_active((select id from ids where k = 'collab'), false)$$,
  'an empty category can be retired');
select throws_ok(
  $$select public.admin_save_app(null, (select id from ids where k = 'collab'), 'Miro', '{Grant}', '{Member}')$$,
  '23514', 'choose an active category', 'no new application in a retired category');

-- ---------------------------------------------------------------------------
-- Equipment and access types
-- ---------------------------------------------------------------------------
insert into ids values ('tablet', public.admin_save_equipment_type(null, 'Tablet', '{Return,Issue}', true));
select ok(
  (select actions = '{Issue,Return}' and needs_description
   from public.equipment_types where id = (select id from ids where k = 'tablet')),
  'an admin adds an equipment type (Issue / Return, may need a description)');
select throws_ok($$select public.admin_save_equipment_type(null, 'Monitor', '{Grant}', false)$$,
  '23514', null, 'equipment actions are Issue / Return');
select lives_ok($$select public.admin_set_equipment_type_active((select id from ids where k = 'tablet'), false)$$,
  'an equipment type can be retired');

insert into ids values ('parking', public.admin_save_access_type(null, 'Parking', '{Grant,Disable}', '{Car park A, Car park B}'));
select ok(
  (select scopes = '{Car park A,Car park B}' from public.physical_access_types
   where id = (select id from ids where k = 'parking')),
  'an admin adds an access type with its scopes');
select throws_ok($$select public.admin_save_access_type(null, 'Lockers', '{Grant}', '{}')$$,
  '23514', 'add 1–12 scopes', 'an access type needs at least one scope');
select lives_ok($$select public.admin_set_access_type_active((select id from ids where k = 'parking'), false)$$,
  'an access type can be retired');

-- ---------------------------------------------------------------------------
-- The audit log (read as the owner)
-- ---------------------------------------------------------------------------
reset role;
select is(
  (select count(*)::int from public.audit_events
   where action like 'catalog.app_%' and entity_id = (select id::text from ids where k = 'notion')),
  4, 'added, changed, retired, restored — the unchanged save is not logged');
select ok(
  (select diff -> 'before' ->> 'name' = 'Notion' and diff -> 'after' ->> 'name' = 'Notion Team'
   from public.audit_events where action = 'catalog.app_changed'
     and entity_id = (select id::text from ids where k = 'notion')),
  'a change records before → after');
select is(
  (select count(*)::int from public.audit_events
   where action in ('catalog.category_added', 'catalog.category_retired',
                    'catalog.equipment_type_added', 'catalog.equipment_type_retired',
                    'catalog.access_type_added', 'catalog.access_type_retired')
     and actor_id = 'user_ac_admin'),
  6, 'categories, equipment and access types are audited too, with the admin as actor');
select is(
  (select count(*)::int from public.catalog_apps where name = 'Notion Team'),
  1, 'nothing was deleted or duplicated');

select * from finish();
rollback;

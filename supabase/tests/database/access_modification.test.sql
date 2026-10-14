-- Access modification (F10a-1): "Who is changing?" starts a draft with
-- section 2 from the last closed request and nothing pre-filled; lines about
-- held items point to the inventory (change / remove / return), new lines
-- can't repeat what is held; one open per person, none while leaving.
-- Run: pnpm db:test   (needs the local database: pnpm db:start)
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

-- Fixtures (fake people only), inserted as the table owner.
insert into public.app_users (clerk_user_id, email, first_name, last_name) values
  ('user_am_admin', 'am-admin@example.test', 'Ada', 'Admin'),
  ('user_am_abe',   'am-abe@example.test',   'Abe', 'Approver');
insert into public.user_roles (clerk_user_id, role) values
  ('user_am_admin', 'admin'), ('user_am_admin', 'requester'), ('user_am_admin', 'it_operator'),
  ('user_am_abe', 'approver');
insert into public.signature_assets (user_id, kind, source, typed_text) values
  ('user_am_admin', 'initials', 'typed', 'AA'),
  ('user_am_abe', 'initials', 'typed', 'AB');

-- Nina's onboarding: Slack, Figma, Hexnode, an "Other" app, a laptop, office access.
insert into public.requests
  (created_by, first_name, last_name, work_email, job_title, department_id, country,
   manager_name, requestor_name, effective_date)
values ('user_am_admin', 'Nina', 'Test', 'nina.am@example.test', 'Analyst',
  (select id from public.departments where name = 'Sales'), 'IT',
  'Mara Manager', 'Rita Requestor', date '2026-01-05');
create temporary table onb as select id from public.requests where work_email = 'nina.am@example.test';
grant select on onb to authenticated;

insert into public.request_access_items (request_id, app_id, action, permission)
select (select id from onb), a.id, x.action, x.permission
from (values ('Slack', 'Grant', 'Regular Member'), ('Figma', 'Grant', 'Dev'), ('Hexnode (MDM)', 'Enroll', 'Device'))
  as x (name, action, permission)
join public.catalog_apps a on a.name = x.name;
insert into public.request_access_items (request_id, app_name, action)
values ((select id from onb), 'Miro Board', 'Grant');
insert into public.request_equipment_items (request_id, type_id, action, asset_tag)
select (select id from onb), id, 'Issue', 'LT-9' from public.equipment_types where name = 'Laptop · macOS';
insert into public.request_physical_access_items (request_id, type_id, action, scope)
select (select id from onb), id, 'Grant', 'Badge' from public.physical_access_types where name = 'Office access';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_am_admin","role":"authenticated"}', true);
select public.transition_request(id, 'in_execution') from onb;
insert into public.execution_confirmations (request_id, executed_by, checks)
select id, 'user_am_admin',
  '{"access_provisioned": true, "devices_enrolled": true, "security_controls": true}' from onb;
select public.sign_request(id, public.request_snapshot_preview(id)) from onb;
reset role;
create temporary table reviewed as select private.request_snapshot_data(id) as data from onb;
grant select on reviewed to authenticated;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_am_abe","role":"authenticated"}', true);
select public.confirm_request(id, (select data from reviewed)) from onb;
reset role;

-- Figma is retired after Nina got it: she still has it and it must still be removable.
update public.catalog_apps set active = false where name = 'Figma';

create temporary table nina as select id from public.employees where work_email = 'nina.am@example.test';
create temporary table held as
  select i.id, i.name, i.kind from public.employee_access_inventory i
  where i.employee_id = (select id from nina) and i.ended_at is null;
-- Ole is leaving: an offboarding draft is open for him.
insert into public.requests (created_by, type, first_name, work_email)
values ('user_am_admin', 'offboarding', 'Ole', 'ole.am@example.test');
create temporary table ole as select id from public.employees where work_email = 'ole.am@example.test';
-- An onboarding draft for someone else.
insert into public.requests (created_by, first_name) values ('user_am_admin', 'Dora');
create temporary table dora as select id from public.requests where first_name = 'Dora' and created_by = 'user_am_admin';
grant select on dora to authenticated;
create temporary table chg (label text, id uuid);
grant select on nina, held, ole to authenticated;
grant select, insert on chg to authenticated;

-- ---------------------------------------------------------------------------
-- Starting one
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_am_abe","role":"authenticated"}', true);
select throws_ok($$select public.create_access_modification((select id from nina))$$,
  '42501', 'only the IT side starts an access change', 'an approver cannot start an access change');

select set_config('request.jwt.claims', '{"sub":"user_am_admin","role":"authenticated"}', true);
insert into chg select 'nina', public.create_access_modification((select id from nina));
select ok(
  (select type = 'access_modification' and state = 'draft' and job_title = 'Analyst' and country = 'IT'
          and manager_name = 'Mara Manager' and employee_id = (select id from nina)
   from public.requests where id = (select id from chg where label = 'nina')),
  'Raju starts an access change for Nina: section 2 from her last closed request');
select is(
  (select count(*)::int from public.request_access_items where request_id = (select id from chg where label = 'nina'))
  + (select count(*)::int from public.request_equipment_items where request_id = (select id from chg where label = 'nina'))
  + (select count(*)::int from public.request_physical_access_items where request_id = (select id from chg where label = 'nina')),
  0, 'nothing is pre-filled — what she keeps needs no line');
select ok(
  exists (select 1 from public.audit_events where action = 'request.access_change_started'
          and entity_id = (select id::text from chg where label = 'nina') and (diff ->> 'held')::int = 6),
  'starting it is audited with what she holds (6 items)');
select throws_ok($$select public.create_access_modification((select id from nina))$$,
  '23514', null, 'one open access change per person');
select throws_ok($$select public.create_access_modification((select id from ole))$$,
  '23514', null, 'no access change while the person is leaving');
select lives_ok($$insert into chg select 'empty', public.create_access_modification(null)$$,
  'an empty access change for someone not in the app yet');

-- ---------------------------------------------------------------------------
-- Applications: change, remove, add
-- ---------------------------------------------------------------------------
select lives_ok(
  $$insert into public.request_access_items (request_id, app_id, inventory_id, action, permission)
    select (select id from chg where label = 'nina'), a.id, (select id from held where name = 'Slack'), 'Modify', 'Workspace Owner'
    from public.catalog_apps a where a.name = 'Slack'$$,
  'change: Slack Regular Member → Workspace Owner');
select throws_ok(
  $$update public.request_access_items set permission = 'Regular Member'
    where request_id = (select id from chg where label = 'nina') and app_name = 'Slack'$$,
  '23514', 'that is the permission the person has today — nothing to change',
  'a "change" to the same permission is refused');
select lives_ok(
  $$insert into public.request_access_items (request_id, app_id, inventory_id, action, permission)
    select (select id from chg where label = 'nina'), a.id, (select id from held where name = 'Figma'), 'Remove', 'Full'
    from public.catalog_apps a where a.name = 'Figma'$$,
  'remove: Figma, although retired');
select is(
  (select permission from public.request_access_items
   where request_id = (select id from chg where label = 'nina') and app_name = 'Figma'),
  'Dev', 'a removal keeps what she had (Dev), whatever was sent');
select throws_ok(
  $$insert into public.request_access_items (request_id, app_id, action, permission)
    select (select id from chg where label = 'nina'), a.id, 'Enroll', 'Admin'
    from public.catalog_apps a where a.name = 'Hexnode (MDM)'$$,
  '23514', 'the person already has this application — change it on its row',
  'a new line cannot repeat an app she holds');
select lives_ok(
  $$insert into public.request_access_items (request_id, app_id, action, permission)
    select (select id from chg where label = 'nina'), a.id, 'Grant', 'Maintain'
    from public.catalog_apps a where a.name = 'GitHub'$$,
  'add: GitHub · Maintain (new)');
select lives_ok(
  $$insert into public.request_access_items (request_id, app_name, inventory_id, action)
    values ((select id from chg where label = 'nina'), 'miro board', (select id from held where name = 'Miro Board'), 'Remove')$$,
  'remove: the "Other" app Miro Board');
select throws_ok(
  $$update public.request_access_items set inventory_id = null
    where request_id = (select id from chg where label = 'nina') and app_name = 'Slack'$$,
  '42501', null, 'the link of a line cannot change');

-- ---------------------------------------------------------------------------
-- Devices and access
-- ---------------------------------------------------------------------------
select lives_ok(
  $$insert into public.request_equipment_items (request_id, type_id, inventory_id, action)
    select (select id from chg where label = 'nina'), t.id, (select id from held where kind = 'equipment'), 'Return'
    from public.equipment_types t where t.name = 'Mobile phone'$$,
  'return: her laptop');
select ok(
  (select type_name = 'Laptop · macOS' and asset_tag = 'LT-9' from public.request_equipment_items
   where request_id = (select id from chg where label = 'nina')),
  'the device is copied from the inventory (type, asset tag)');
select throws_ok(
  $$insert into public.request_physical_access_items (request_id, type_id, action, scope)
    select (select id from chg where label = 'nina'), t.id, 'Grant', 'Key'
    from public.physical_access_types t where t.name = 'Office access'$$,
  '23514', 'the person already has this access — change it on its row',
  'a new line cannot repeat access she holds');
select lives_ok(
  $$insert into public.request_physical_access_items (request_id, type_id, inventory_id, action)
    select (select id from chg where label = 'nina'), t.id, (select id from held where kind = 'access'), 'Disable'
    from public.physical_access_types t where t.name = 'Office access'$$,
  'disable: office access');
select is(
  (select scope from public.request_physical_access_items where request_id = (select id from chg where label = 'nina')),
  'Badge', 'a disabled access keeps the scope she had');

-- ---------------------------------------------------------------------------
-- Links must be right
-- ---------------------------------------------------------------------------
select throws_ok(
  $$insert into public.request_equipment_items (request_id, type_id, inventory_id, action)
    select (select id from chg where label = 'nina'), t.id, (select id from held where name = 'Slack'), 'Return'
    from public.equipment_types t where t.name = 'Mobile phone'$$,
  '23514', 'that item is not held by this person any more — reload the request',
  'a line cannot point to an item of another kind');
select throws_ok(
  $$insert into public.request_access_items (request_id, app_id, inventory_id, action)
    select (select id from chg where label = 'empty'), a.id, (select id from held where name = 'Hexnode (MDM)'), 'Remove'
    from public.catalog_apps a where a.name = 'Hexnode (MDM)'$$,
  '23514', 'that item is not held by this person any more — reload the request',
  'a line cannot point to someone else''s item');
select throws_ok(
  $$insert into public.request_access_items (request_id, app_id, inventory_id, action)
    select (select id from dora), a.id, (select id from held where name = 'Hexnode (MDM)'), 'Enroll'
    from public.catalog_apps a where a.name = 'Hexnode (MDM)'$$,
  '23514', 'only an access change points to what the person holds',
  'an onboarding line cannot point to the inventory');

select is(
  (select count(*)::int from public.employee_access_inventory where employee_id = (select id from nina) and ended_at is null),
  6, 'nothing changes in her inventory until the request closes');

select * from finish();
rollback;

-- Access inventory (F09a): filled when a request closes — holds add, removals
-- end, grants of something held replace it; read by every role, written only
-- by the database, never deleted.
-- Run: pnpm db:test   (needs the local database: pnpm db:start)
begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

-- Fixtures (fake people only), inserted as the table owner.
insert into public.app_users (clerk_user_id, email, first_name, last_name) values
  ('user_in_admin', 'in-admin@example.test', 'Ada', 'Admin'),
  ('user_in_abe',   'in-abe@example.test',   'Abe', 'Approver');
insert into public.user_roles (clerk_user_id, role) values
  ('user_in_admin', 'admin'), ('user_in_admin', 'requester'), ('user_in_admin', 'it_operator'),
  ('user_in_abe', 'approver');
insert into public.signature_assets (user_id, kind, source, typed_text) values
  ('user_in_admin', 'initials', 'typed', 'AA'),
  ('user_in_abe', 'initials', 'typed', 'AB');

-- Two requests about the same person (Nina): the first gives, the second changes.
insert into public.requests
  (created_by, type, first_name, last_name, work_email, job_title, department_id, country,
   manager_name, requestor_name, effective_date)
select 'user_in_admin', x.type::public.request_type, 'Nina', 'Test', 'nina.test@example.test', 'Analyst',
  (select id from public.departments where name = 'Engineering'), 'CH',
  'Mara Manager', 'Rita Requestor', date '2026-10-14'
from (values (1, 'onboarding'), (2, 'access_modification')) as x (n, type)
order by x.n;

create temporary table ids as
select row_number() over (order by ticket_number) as n, id, ticket_id
from public.requests where work_email = 'nina.test@example.test';
grant select on ids to authenticated;

-- Request 1: Slack, Figma, Hexnode, an "Other" app, a laptop, a phone, office access.
insert into public.request_access_items (request_id, app_id, action, permission)
select (select id from ids where n = 1), a.id, x.action, x.permission
from (values ('Slack', 'Grant', 'Regular Member'), ('Figma', 'Grant', 'Dev'), ('Hexnode (MDM)', 'Enroll', 'Device'))
  as x (name, action, permission)
join public.catalog_apps a on a.name = x.name;
insert into public.request_access_items (request_id, app_name, action, permission)
values ((select id from ids where n = 1), 'Miro Board', 'Grant', null);
insert into public.request_equipment_items (request_id, type_id, action, asset_tag)
select (select id from ids where n = 1), t.id, 'Issue', x.tag
from (values ('Laptop · macOS', 'LT-1'), ('Mobile phone', null)) as x (name, tag)
join public.equipment_types t on t.name = x.name;
insert into public.request_physical_access_items (request_id, type_id, action, scope)
select (select id from ids where n = 1), t.id, 'Grant', 'Badge'
from public.physical_access_types t where t.name = 'Office access';

-- Request 2 is an access modification: Slack → Admin, Figma removed, laptop back,
-- badge disabled, the Other app removed (an onboarding only grants since 2026-10-13).
select is((select count(*)::int from public.request_access_items where request_id = (select id from ids where n = 2)), 0,
  'request 2 starts empty');
insert into public.request_access_items (request_id, app_id, action, permission)
select (select id from ids where n = 2), a.id, x.action, x.permission
from (values ('Slack', 'Modify', 'Workspace Owner'), ('Figma', 'Remove', null)) as x (name, action, permission)
join public.catalog_apps a on a.name = x.name;
insert into public.request_access_items (request_id, app_name, action)
values ((select id from ids where n = 2), 'miro board', 'Remove');
insert into public.request_equipment_items (request_id, type_id, action, asset_tag)
select (select id from ids where n = 2), t.id, 'Return', 'LT-1'
from public.equipment_types t where t.name = 'Laptop · macOS';
insert into public.request_physical_access_items (request_id, type_id, action, scope)
select (select id from ids where n = 2), t.id, 'Disable', 'Badge'
from public.physical_access_types t where t.name = 'Office access';

-- Ada executes and signs both.
-- Form v4.2 (F27): new requests need an Office before Review & sign.
update public.requests set office_id = (select id from public.offices where name = 'Dubai')
where office_id is null and state not in ('closed', 'cancelled');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_in_admin","role":"authenticated"}', true);
select public.transition_request(id, 'in_execution') from ids;
-- (the access change already has a pre-filled section 9 — 2026-10-14)
insert into public.execution_confirmations (request_id, executed_by, checks)
select id, 'user_in_admin',
  '{"access_provisioned": true, "devices_enrolled": true, "security_controls": true}' from ids
on conflict (request_id) do update set checks = excluded.checks;
select public.sign_request(id, public.request_snapshot_preview(id)) from ids;
reset role;

create temporary table reviewed as
select n, private.request_snapshot_data(id) as data from ids;
grant select on reviewed to authenticated;

-- ---------------------------------------------------------------------------
-- Nothing reaches the inventory before closing
-- ---------------------------------------------------------------------------
select is((select count(*)::int from public.employee_access_inventory i
  join public.employees e on e.id = i.employee_id where e.work_email = 'nina.test@example.test'),
  0, 'signed but not closed: nothing in the inventory yet');

-- ---------------------------------------------------------------------------
-- Request 1 closes → seven rows held
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_in_abe","role":"authenticated"}', true);
select public.confirm_request(id, (select data from reviewed where n = 1)) from ids where n = 1;
reset role;

-- security_invoker: reads through the view obey the caller's RLS.
create temporary view nina with (security_invoker = true) as
select i.* from public.employee_access_inventory i
join public.employees e on e.id = i.employee_id where e.work_email = 'nina.test@example.test';
grant select on nina to authenticated;

select is((select count(*)::int from nina where ended_at is null), 7,
  'closing the first request: 3 apps, 1 other app, 2 devices and 1 access are held');
select ok((select bool_and(granted_request_id = (select id from ids where n = 1)) from nina),
  'every row points to the request that granted it');
select is((select category_name || ' · ' || name || ' · ' || permission from nina where name = 'Slack'),
  'Core business · Slack · Regular Member', 'names and permission are copied from the request');
select is((select category_name from nina where name = 'Miro Board'), 'Other',
  'an "Other" app is kept with its typed name');
select is((select asset_tag from nina where name = 'Laptop · macOS'), 'LT-1', 'the laptop keeps its asset tag');
select is((select permission from nina where kind = 'access'), 'Badge', 'access keeps its scope');
select is(
  (select diff ->> 'added' from public.audit_events
   where action = 'inventory.updated' and diff ->> 'request_id' = (select id from ids where n = 1)::text),
  '7', 'the change is audited (inventory.updated, 7 added)');

-- ---------------------------------------------------------------------------
-- Request 2 closes → replace, remove, return
-- ---------------------------------------------------------------------------
-- An access change freezes what the person keeps (F10a-2): request 1 closed
-- after request 2 was reviewed, so that review is out of date.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_in_abe","role":"authenticated"}', true);
select throws_ok(
  $$select public.confirm_request(id, (select data from reviewed where n = 2)) from ids where n = 2$$,
  '40001', null, 'an access change reviewed before the inventory changed must be reviewed again');
reset role;
update reviewed set data = private.request_snapshot_data((select id from ids where n = 2)) where n = 2;
-- A fresh review isn't enough: Ada signed the old one (F10d-1). Abe returns it,
-- Ada signs again, then Abe confirms.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_in_abe","role":"authenticated"}', true);
select throws_ok(
  $$select public.confirm_request(id, (select data from reviewed where n = 2)) from ids where n = 2$$,
  '23514', 'the request changed after it was signed for IT — return it so it can be signed again',
  'the approver confirms only what the IT side signed');
select public.return_request(id, 'Her access changed since you signed — please sign again') from ids where n = 2;
select set_config('request.jwt.claims', '{"sub":"user_in_admin","role":"authenticated"}', true);
select public.sign_request(id, public.request_snapshot_preview(id)) from ids where n = 2;
reset role;
update reviewed set data = private.request_snapshot_data((select id from ids where n = 2)) where n = 2;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_in_abe","role":"authenticated"}', true);
select public.confirm_request(id, (select data from reviewed where n = 2)) from ids where n = 2;
reset role;

select is((select end_reason from nina where name = 'Slack' and permission = 'Regular Member'), 'replaced',
  'Slack Regular Member is ended as replaced');
select is((select count(*)::int from nina where name = 'Slack' and permission = 'Workspace Owner' and ended_at is null), 1,
  'Slack Admin is now held');
select is((select end_reason from nina where name = 'Figma'), 'removed', 'Figma is removed');
select ok((select ended_at is not null from nina where name = 'Miro Board'),
  'the "Other" app is matched by name, whatever the letter case');
select is((select end_reason from nina where name = 'Laptop · macOS'), 'removed', 'the returned laptop is ended');
select ok((select ended_at is null from nina where name = 'Mobile phone'), 'the phone is still held');
select is((select end_reason from nina where kind = 'access'), 'removed', 'disabled office access is ended');
select ok((select bool_and(ended_request_id = (select id from ids where n = 2)) from nina where ended_at is not null),
  'every ended row points to the request that ended it');
select is((select string_agg(name, ', ' order by name) from nina where ended_at is null),
  'Hexnode (MDM), Mobile phone, Slack', 'what Nina holds today');

-- ---------------------------------------------------------------------------
-- Who reads, who writes
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_in_abe","role":"authenticated"}', true);
select is((select count(*)::int from nina), 8, 'an approver reads the inventory (reports)');
select set_config('request.jwt.claims', '{"sub":"user_in_admin","role":"authenticated"}', true);
select is((select count(*)::int from nina), 8, 'the IT side reads the inventory');
select throws_ok(
  $$insert into public.employee_access_inventory (employee_id, kind, name, granted_at, source)
    select employee_id, 'application', 'Sneaky', now(), 'import' from nina limit 1$$,
  '42501', null, 'nobody writes rows by hand');
select throws_ok($$update public.employee_access_inventory set permission = 'Owner'$$,
  '42501', null, 'nobody edits rows by hand');
select throws_ok($$delete from public.employee_access_inventory$$,
  '42501', null, 'nobody deletes rows');
reset role;

-- Even the table owner cannot rewrite history.
select throws_ok(
  $$update public.employee_access_inventory set permission = 'Owner'
    where id = (select id from nina where name = 'Slack' and permission = 'Workspace Owner')$$,
  '23514', 'inventory rows only end, once', 'what was granted never changes');
select throws_ok(
  $$update public.employee_access_inventory set end_reason = 'replaced'
    where id = (select id from nina where name = 'Figma')$$,
  '23514', 'inventory rows only end, once', 'an ended row stays as it ended');
select throws_ok(
  $$delete from public.employee_access_inventory where id = (select id from nina where name = 'Figma')$$,
  '42501', 'the access inventory is never deleted', 'the owner cannot delete either');

select * from finish();
rollback;

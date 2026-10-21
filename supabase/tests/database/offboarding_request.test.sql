-- Offboarding request (F09b-1): "Who is leaving?" pre-filled from the access
-- inventory, one open offboarding per person, rows only remove, the SLA
-- deadline (company timezone), fixed once execution starts.
-- Run: pnpm db:test   (needs the local database: pnpm db:start)
begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

-- Fixtures (fake people only), inserted as the table owner.
insert into public.app_users (clerk_user_id, email, first_name, last_name) values
  ('user_ob_admin', 'ob-admin@example.test', 'Ada', 'Admin'),
  ('user_ob_abe',   'ob-abe@example.test',   'Abe', 'Approver');
insert into public.user_roles (clerk_user_id, role) values
  ('user_ob_admin', 'admin'), ('user_ob_admin', 'requester'), ('user_ob_admin', 'it_operator'),
  ('user_ob_abe', 'approver');
insert into public.signature_assets (user_id, kind, source, typed_text) values
  ('user_ob_admin', 'initials', 'typed', 'AA'),
  ('user_ob_abe', 'initials', 'typed', 'AB');

-- Nina's onboarding: Slack, Figma, Hexnode, an "Other" app, a laptop, office access.
insert into public.requests
  (created_by, first_name, last_name, work_email, job_title, department_id, country,
   manager_name, requestor_name, effective_date)
values ('user_ob_admin', 'Nina', 'Test', 'nina.ob@example.test', 'Analyst',
  (select id from public.departments where name = 'Sales'), 'IT',
  'Mara Manager', 'Rita Requestor', date '2026-01-05');
create temporary table onb as select id from public.requests where work_email = 'nina.ob@example.test';
grant select on onb to authenticated;

insert into public.request_access_items (request_id, app_id, action, permission)
select (select id from onb), a.id, x.action, x.permission
from (values ('Slack', 'Grant', 'Regular Member'), ('Figma', 'Grant', 'Dev'), ('Hexnode (MDM)', 'Enroll', 'Device'))
  as x (name, action, permission)
join public.catalog_apps a on a.name = x.name;
insert into public.request_access_items (request_id, app_name, action)
values ((select id from onb), 'Miro Board', 'Grant');
insert into public.request_equipment_items (request_id, type_id, action, asset_tag)
select (select id from onb), id, 'Issue', 'LT-7' from public.equipment_types where name = 'Laptop · macOS';
insert into public.request_physical_access_items (request_id, type_id, action, scope)
select (select id from onb), id, 'Grant', 'Badge' from public.physical_access_types where name = 'Office access';

-- Form v4.2 (F27): new requests need an Office before Review & sign.
update public.requests set office_id = (select id from public.offices where name = 'Dubai')
where office_id is null and state not in ('closed', 'cancelled');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_ob_admin","role":"authenticated"}', true);
select public.transition_request(id, 'in_execution') from onb;
insert into public.execution_confirmations (request_id, executed_by, checks)
select id, 'user_ob_admin',
  '{"access_provisioned": true, "devices_enrolled": true, "security_controls": true}' from onb;
select public.sign_request(id, public.request_snapshot_preview(id)) from onb;
reset role;
create temporary table reviewed as select private.request_snapshot_data(id) as data from onb;
grant select on reviewed to authenticated;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_ob_abe","role":"authenticated"}', true);
select public.confirm_request(id, (select data from reviewed)) from onb;
reset role;

-- Figma is retired after Nina got it: she still has it and it must still be removable.
update public.catalog_apps set active = false where name = 'Figma';

create temporary table nina as select id from public.employees where work_email = 'nina.ob@example.test';
grant select on nina to authenticated;
create temporary table off (label text, id uuid);
grant select, insert on off to authenticated;

-- ---------------------------------------------------------------------------
-- Who may start one
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_ob_abe","role":"authenticated"}', true);
select throws_ok($$select public.create_offboarding((select id from nina))$$,
  '42501', 'only the IT side starts an offboarding', 'an approver cannot start an offboarding');

select set_config('request.jwt.claims', '{"sub":"user_ob_admin","role":"authenticated"}', true);
insert into off select 'nina', public.create_offboarding((select id from nina));

-- ---------------------------------------------------------------------------
-- The pre-filled draft
-- ---------------------------------------------------------------------------
select is((select type::text || ' · ' || state::text from public.requests where id = (select id from off where label = 'nina')),
  'offboarding · draft', 'Raju starts an offboarding draft for Nina');
select is(
  (select job_title || ' · ' || country || ' · ' || manager_name || ' · ' || work_email
   from public.requests where id = (select id from off where label = 'nina')),
  'Analyst · IT · Mara Manager · nina.ob@example.test', 'section 2 comes from her last closed request');
select is(
  (select string_agg(app_name || ':' || action || ':' || coalesce(permission, '-'), ', ' order by app_name)
   from public.request_access_items where request_id = (select id from off where label = 'nina')),
  'Figma:Remove:Dev, Hexnode (MDM):Remove:Device, Miro Board:Remove:-, Slack:Remove:Regular Member',
  'every application she holds is pre-filled as Remove, with what she had');
select is(
  (select type_name || ':' || action || ':' || asset_tag from public.request_equipment_items
   where request_id = (select id from off where label = 'nina')),
  'Laptop · macOS:Return:LT-7', 'her laptop is pre-filled as Return, with its asset tag');
select is(
  (select type_name || ':' || action || ':' || scope from public.request_physical_access_items
   where request_id = (select id from off where label = 'nina')),
  'Office access:Disable:Badge', 'office access is pre-filled as Disable (the type offers it)');
select is(
  (select diff -> 'prefilled' from public.audit_events
   where action = 'request.offboarding_started' and entity_id = (select id from off where label = 'nina')::text),
  '{"access": 1, "equipment": 1, "applications": 4}'::jsonb, 'audited with what was pre-filled');

select throws_like($$select public.create_offboarding((select id from nina))$$,
  'an offboarding is already open for this person (UAM-%', 'only one open offboarding per person');

insert into off select 'empty', public.create_offboarding(null);
select is((select count(*)::int from public.request_access_items where request_id = (select id from off where label = 'empty')),
  0, 'someone not in the app yet: an empty offboarding');

-- ---------------------------------------------------------------------------
-- Offboarding rows only remove
-- ---------------------------------------------------------------------------
select throws_ok(
  $$insert into public.request_access_items (request_id, app_id, action, permission)
    select (select id from off where label = 'empty'), id, 'Grant', 'Regular Member' from public.catalog_apps where name = 'Slack'$$,
  '23514', 'an offboarding only removes applications', 'no Grant on an offboarding');
select lives_ok(
  $$insert into public.request_access_items (request_id, app_id, action)
    select (select id from off where label = 'empty'), id, 'Remove' from public.catalog_apps where name = 'Figma'$$,
  'a retired application can still be removed');
select throws_ok(
  $$insert into public.request_equipment_items (request_id, type_id, action)
    select (select id from off where label = 'empty'), id, 'Issue' from public.equipment_types where name = 'Mobile phone'$$,
  '23514', 'an offboarding only returns equipment', 'no Issue on an offboarding');
select throws_ok(
  $$insert into public.request_physical_access_items (request_id, type_id, action, scope)
    select (select id from off where label = 'empty'), id, 'Grant', 'Badge' from public.physical_access_types where name = 'Office access'$$,
  '23514', 'an offboarding only disables or removes access', 'no Grant of access on an offboarding');

-- ---------------------------------------------------------------------------
-- The type stays
-- ---------------------------------------------------------------------------
select throws_ok(
  $$update public.requests set type = 'onboarding' where id = (select id from off where label = 'nina')$$,
  '23514', 'an offboarding is started from New request and stays an offboarding',
  'an offboarding cannot become an onboarding');
reset role;
insert into public.requests (created_by) values ('user_ob_admin');
create temporary table draft as select id from public.requests
where created_by = 'user_ob_admin' and type = 'onboarding' and state = 'draft';
grant select on draft to authenticated;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_ob_admin","role":"authenticated"}', true);
select throws_ok($$update public.requests set type = 'offboarding' where id = (select id from draft)$$,
  '23514', 'an offboarding is started from New request and stays an offboarding',
  'an onboarding draft cannot become an offboarding');
select throws_ok($$update public.requests set sla_timeline = 'within_24h' where id = (select id from draft)$$,
  '23514', null, 'only offboardings have an SLA');

-- ---------------------------------------------------------------------------
-- The deadline (Asia/Dubai, +04)
-- ---------------------------------------------------------------------------
update public.requests
set sla_timeline = 'within_24h', access_cutoff_at = '2026-09-30 18:00+04', last_working_day = '2026-09-30'
where id = (select id from off where label = 'nina');
select is((select sla_due_at from public.requests where id = (select id from off where label = 'nina')),
  '2026-10-01 18:00+04'::timestamptz, 'within 24h: cut-off + 24 hours');
update public.requests set sla_timeline = 'within_48h' where id = (select id from off where label = 'nina');
select is((select sla_due_at from public.requests where id = (select id from off where label = 'nina')),
  '2026-10-02 18:00+04'::timestamptz, 'within 48h: cut-off + 48 hours');
update public.requests set sla_timeline = 'same_day' where id = (select id from off where label = 'nina');
select is((select sla_due_at from public.requests where id = (select id from off where label = 'nina')),
  '2026-09-30 23:59:59+04'::timestamptz, 'same day: 23:59:59 of the cut-off day, Dubai time');
update public.requests set sla_due_at = '2030-01-01' where id = (select id from off where label = 'nina');
select is((select sla_due_at from public.requests where id = (select id from off where label = 'nina')),
  '2026-09-30 23:59:59+04'::timestamptz, 'the deadline cannot be typed — the database works it out');
update public.requests set handover_to = '  Giulia Bianchi  ' where id = (select id from off where label = 'nina');
select is((select handover_to from public.requests where id = (select id from off where label = 'nina')),
  'Giulia Bianchi', 'handover name is trimmed');

-- ---------------------------------------------------------------------------
-- Starting execution: SLA needed, then fixed
-- ---------------------------------------------------------------------------
select throws_ok($$select public.transition_request((select id from off where label = 'empty'), 'in_execution')$$,
  '23514', 'set the access removal SLA (timeline, last working day and cut-off) before starting execution',
  'no execution without the SLA');
select lives_ok($$select public.transition_request((select id from off where label = 'nina'), 'in_execution')$$,
  'with the SLA set, execution starts');
select throws_ok(
  $$update public.requests set sla_timeline = 'within_48h' where id = (select id from off where label = 'nina')$$,
  '23514', 'the access removal SLA is fixed once execution starts', 'the timeline is fixed after the start');
select throws_ok(
  $$update public.requests set access_cutoff_at = '2026-10-05 18:00+04' where id = (select id from off where label = 'nina')$$,
  '23514', 'the access removal SLA is fixed once execution starts', 'the cut-off is fixed after the start');
reset role;
update public.app_settings set company_timezone = 'Europe/London';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_ob_admin","role":"authenticated"}', true);
update public.requests set handover_to = 'Giulia B.' where id = (select id from off where label = 'nina');
select is((select sla_due_at from public.requests where id = (select id from off where label = 'nina')),
  '2026-09-30 23:59:59+04'::timestamptz, 'the deadline stays even if the company timezone changes later');
reset role;

-- New request (the app's createDraft) inserts as the signed-in user: the
-- offboarding rules trigger must work for them too (CI caught this).
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_ob_admin","role":"authenticated"}', true);
select lives_ok($$insert into public.requests (created_by) values ('user_ob_admin')$$,
  'a signed-in requester still creates an onboarding draft');
select lives_ok($$insert into public.requests (created_by, type) values ('user_ob_admin', 'offboarding')$$,
  'a signed-in requester can insert an empty offboarding draft');
reset role;

-- The unique index guards every path, not only create_offboarding().
select throws_ok(
  $$insert into public.requests (created_by, type, work_email) values ('user_ob_admin', 'offboarding', 'nina.ob@example.test')$$,
  '23505', null, 'a second open offboarding for the same person is refused by the database');

select * from finish();
rollback;

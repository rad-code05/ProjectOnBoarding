-- Section 9 on an access change (2026-10-14): labels per type, the answer
-- "no_change", and the pre-fill by what changed when execution starts.
-- Run: pnpm db:test
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into public.app_users (clerk_user_id, email, first_name, last_name) values
  ('user_s9_admin', 's9-admin@example.test', 'Ada', 'Admin'),
  ('user_s9_abe',   's9-abe@example.test',   'Abe', 'Approver');
insert into public.user_roles (clerk_user_id, role) values
  ('user_s9_admin', 'admin'), ('user_s9_admin', 'requester'), ('user_s9_admin', 'it_operator'),
  ('user_s9_abe', 'approver');
insert into public.signature_assets (user_id, kind, source, typed_text) values
  ('user_s9_admin', 'initials', 'typed', 'AA'),
  ('user_s9_abe', 'initials', 'typed', 'AB');

select is(
  (select type_labels ->> 'access_modification' from public.execution_checklist_items where key = 'access_provisioned'),
  'All authorised access modified', 'an access change says "modified"');
select is(
  (select type_labels ->> 'onboarding' from public.execution_checklist_items where key = 'access_provisioned'),
  'All authorised access provisioned', 'an onboarding says "provisioned"');

-- Nina's onboarding with Slack, closed.
insert into public.requests
  (created_by, first_name, last_name, work_email, job_title, department_id, country,
   manager_name, requestor_name, effective_date)
values ('user_s9_admin', 'Nina', 'Test', 'nina.s9@example.test', 'Analyst',
  (select id from public.departments where name = 'Sales'), 'IT', 'Mara Manager', 'Rita Requestor', date '2026-01-05');
create temporary table onb as select id from public.requests where work_email = 'nina.s9@example.test';
insert into public.request_access_items (request_id, app_id, action, permission)
select (select id from onb), id, 'Grant', 'Regular Member' from public.catalog_apps where name = 'Slack';
grant select on onb to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_s9_admin","role":"authenticated"}', true);
select public.transition_request(id, 'in_execution') from onb;
select is(
  (select count(*)::int from public.execution_confirmations where request_id = (select id from onb)),
  0, 'an onboarding is not pre-filled');
insert into public.execution_confirmations (request_id, executed_by, checks)
select id, 'user_s9_admin', '{"access_provisioned": true, "devices_enrolled": "not_needed", "security_controls": true}' from onb;
select public.sign_request(id, public.request_snapshot_preview(id)) from onb;
reset role;
create temporary table reviewed as select private.request_snapshot_data(id) as data from onb;
grant select on reviewed to authenticated;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_s9_abe","role":"authenticated"}', true);
select public.confirm_request(id, (select data from reviewed)) from onb;

-- Her access change: only Slack changes.
select set_config('request.jwt.claims', '{"sub":"user_s9_admin","role":"authenticated"}', true);
create temporary table chg as
  select public.create_access_modification((select id from public.employees where work_email = 'nina.s9@example.test')) as id;
insert into public.request_access_items (request_id, app_id, inventory_id, action, permission)
select (select id from chg), a.id, i.id, 'Modify', 'Workspace Owner'
from public.catalog_apps a
join public.employee_access_inventory i on i.app_id = a.id and i.ended_at is null
where a.name = 'Slack';
select public.transition_request(id, 'in_execution') from chg;

select is(
  (select checks from public.execution_confirmations where request_id = (select id from chg)),
  '{"access_provisioned": true, "devices_enrolled": "no_change", "security_controls": "no_change"}'::jsonb,
  'starting execution pre-fills Yes where access changed and "no change" for devices and security');
reset role;
select ok(private.execution_complete((select id from chg)), 'pre-filled = complete');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_s9_admin","role":"authenticated"}', true);
select lives_ok(
  $$update public.execution_confirmations set checks = checks || '{"access_provisioned": false}'
    where request_id = (select id from chg)$$,
  'Raju can still untick an item');
reset role;
select ok(not private.execution_complete((select id from chg)), 'an unticked item is not complete');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_s9_admin","role":"authenticated"}', true);
select lives_ok(
  $$update public.execution_confirmations set checks = checks || '{"devices_enrolled": false}'
    where request_id = (select id from chg)$$,
  '"no change" can be undone (changes were made after all)');
select throws_ok(
  $$update public.execution_confirmations set checks = checks || '{"devices_enrolled": "maybe"}'
    where request_id = (select id from chg)$$,
  '23514', null, 'other answers are refused');

select * from finish();
rollback;

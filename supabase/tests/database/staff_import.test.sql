-- Import of existing staff (F24a): admins only; Confirm makes closed Imported
-- records (IMP series) with the file's dates — a leaver also an imported
-- offboarding — fills the access inventory (ended for leavers), counts in
-- the reports, sends no email, audits import.*; refuses people already in
-- the app, future dates and finished imports. Run: pnpm db:test
begin;
create extension if not exists pgtap with schema extensions;
select plan(32);

insert into public.app_users (clerk_user_id, email, first_name, last_name) values
  ('user_si_admin', 'si-admin@example.test', 'Ada', 'Admin'),
  ('user_si_appr',  'si-appr@example.test',  'Abe', 'Approver');
insert into public.user_roles (clerk_user_id, role) values
  ('user_si_admin', 'admin'), ('user_si_admin', 'requester'), ('user_si_admin', 'it_operator'),
  ('user_si_appr', 'approver');

create temporary table t (key text primary key, id uuid);
grant all on t to authenticated;

set local role authenticated;

-- ---------------------------------------------------------------------------
-- Only admins
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"user_si_appr","role":"authenticated"}', true);
select throws_ok($$insert into public.staff_imports (file_name) values ('nope.xlsx')$$,
  '42501', null, 'an approver cannot start an import');

select set_config('request.jwt.claims', '{"sub":"user_si_admin","role":"authenticated"}', true);
with x as (insert into public.staff_imports (file_name) values ('staff-reviewed.xlsx') returning id)
insert into t select 'import', id from x;
select is((select status from public.staff_imports where id = (select id from t where key = 'import')),
  'open', 'an admin starts an import (open)');
select throws_ok(
  $$update public.staff_imports set status = 'imported' where id = (select id from t where key = 'import')$$,
  '42501', null, 'the status changes only through Confirm / Discard');

insert into public.staff_import_rows (import_id, position, data, person) values
  ((select id from t where key = 'import'), 1, '{"Name":"Lucas Moreau"}', jsonb_build_object(
    'first_name', 'Lucas', 'last_name', 'Moreau', 'work_email', 'Lucas.Moreau@example.test',
    'job_title', 'Backend developer', 'department_id', (select id from public.departments where name = 'Engineering'),
    'office_id', (select id from public.offices where name = 'Dubai'), 'nationalities', jsonb_build_array('fr'),
    'start_date', '2025-01-06',
    'access', jsonb_build_array(
      jsonb_build_object('app_id', (select id from public.catalog_apps where name = 'Slack'), 'permission', 'Regular Member'),
      jsonb_build_object('app_id', (select id from public.catalog_apps where name = 'Google Cloud'),
                         'permission', 'Viewer; Editor', 'since', '2025-03-03'),
      jsonb_build_object('name', 'Notion', 'permission', 'Member')))),
  ((select id from t where key = 'import'), 2, '{"Name":"Hana Kobayashi"}', jsonb_build_object(
    'first_name', 'Hana', 'last_name', 'Kobayashi', 'work_email', 'hana.kobayashi@example.test',
    'department_id', (select id from public.departments where name = 'Sales'),
    'office_id', (select id from public.offices where name = 'Geneva'),
    'start_date', '2024-06-10', 'leave_date', '2026-02-28',
    'access', jsonb_build_array(
      jsonb_build_object('app_id', (select id from public.catalog_apps where name = 'Figma'), 'permission', 'View')))),
  ((select id from t where key = 'import'), 3, '{"Name":"Left Out"}', '{}'::jsonb);
update public.staff_import_rows set included = false
where import_id = (select id from t where key = 'import') and position = 3;

-- Problems block Confirm.
update public.staff_import_rows set problems = '[{"field":"Figma","message":"Not a Figma role"}]'
where import_id = (select id from t where key = 'import') and position = 2;
select throws_ok($$select public.import_staff((select id from t where key = 'import'))$$,
  '23514', null, 'a row that needs attention blocks Confirm');
select throws_matching($$select public.import_staff((select id from t where key = 'import'))$$,
  'fix or leave out', '… with the reason');
update public.staff_import_rows set problems = '[]'
where import_id = (select id from t where key = 'import') and position = 2;

select set_config('request.jwt.claims', '{"sub":"user_si_appr","role":"authenticated"}', true);
select throws_ok($$select public.import_staff((select id from t where key = 'import'))$$,
  '42501', null, 'an approver cannot confirm an import');
select is((select count(*) from public.staff_import_rows), 0::bigint, 'an approver sees no import rows');

-- ---------------------------------------------------------------------------
-- Confirm
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"user_si_admin","role":"authenticated"}', true);
select is(public.import_staff((select id from t where key = 'import')),
  '{"people": 2, "leavers": 1, "access": 4, "left_out": 1}'::jsonb,
  'Confirm imports 2 people (1 leaver), 4 access rows, 1 left out');

reset role;
insert into t select 'lucas', id from public.requests where work_email = 'lucas.moreau@example.test';
insert into t select 'hana_on', id from public.requests where work_email = 'hana.kobayashi@example.test' and type = 'onboarding';
insert into t select 'hana_off', id from public.requests where work_email = 'hana.kobayashi@example.test' and type = 'offboarding';

select ok((select ticket_id ~ '^IMP-2025-\d{6}$' and ticket_prefix = 'IMP' and state = 'closed'
                  and import_id = (select id from t where key = 'import')
           from public.requests where id = (select id from t where key = 'lucas')),
  'an Imported record: IMP-<start year>, closed, linked to its import');
select is((select (closed_at at time zone private.company_timezone())::date from public.requests
           where id = (select id from t where key = 'lucas')),
  date '2025-01-06', '… closed on the start date from the file (company time)');
select is((select (created_at)::date from public.requests where id = (select id from t where key = 'lucas')),
  (now())::date, '… but created today (server time — never backdated)');
select is((select country from public.requests where id = (select id from t where key = 'lucas')),
  'AE', 'an empty country takes the office''s');
select is((select nationalities from public.requests where id = (select id from t where key = 'lucas')),
  array['FR'], 'nationalities upper-cased');
select is((select work_email from public.requests where id = (select id from t where key = 'lucas')),
  'lucas.moreau@example.test', 'the work email lower-cased');

select ok((select ticket_id like 'IMP-2026-%' and type = 'offboarding' and state = 'closed'
                  and last_working_day = date '2026-02-28' and sla_due_at is null
           from public.requests where id = (select id from t where key = 'hana_off')),
  'a leaver also gets a closed imported offboarding on the leave date (no SLA)');

select is((select count(*) from public.employee_access_inventory i
           join public.requests r on r.id = i.granted_request_id
           where r.id = (select id from t where key = 'lucas') and i.source = 'import' and i.ended_at is null),
  3::bigint, 'Lucas holds his 3 applications (source import)');
select is((select permission from public.employee_access_inventory
           where granted_request_id = (select id from t where key = 'lucas') and name = 'Google Cloud'),
  'Viewer; Editor', 'several Google Cloud roles, catalog order');
select is((select (granted_at at time zone private.company_timezone())::date from public.employee_access_inventory
           where granted_request_id = (select id from t where key = 'lucas') and name = 'Google Cloud'),
  date '2025-03-03', 'an access''s own "since" date is kept');
select is((select category_name from public.employee_access_inventory
           where granted_request_id = (select id from t where key = 'lucas') and name = 'Notion'),
  'Other', 'an application not in the catalog is kept as Other');
select ok((select ended_at is not null and end_reason = 'removed'
                  and ended_request_id = (select id from t where key = 'hana_off')
           from public.employee_access_inventory where granted_request_id = (select id from t where key = 'hana_on')),
  'the leaver''s access ended with her imported offboarding');

select is((select count(*) from public.email_outbox o
           where o.request_id in (select id from t where key in ('lucas', 'hana_on', 'hana_off'))),
  0::bigint, 'an import sends no email');
select is((select count(*) from public.audit_events
           where action = 'request.created' and entity_id in (select id::text from t where key in ('lucas', 'hana_on', 'hana_off'))),
  0::bigint, 'no request.created for Imported records …');
select is((select count(*) from public.audit_events where action = 'import.person'
           and diff ->> 'import_id' = (select id::text from t where key = 'import')),
  2::bigint, '… one import.person per person');
select ok(exists (select 1 from public.audit_events where action = 'import.completed'
                  and entity_id = (select id::text from t where key = 'import')
                  and diff ->> 'people' = '2' and actor_id = 'user_si_admin'),
  'import.completed with the counts, by the admin');
select is((select onboarding_request_id from public.staff_import_rows
           where import_id = (select id from t where key = 'import') and position = 1),
  (select id from t where key = 'lucas'), 'the row points to its Imported record');

-- Imported people count in the reports.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_si_admin","role":"authenticated"}', true);
select ok(exists (select 1 from public.report_onboarded_by_month(date '2025-01-01', date '2025-01-01')
                  where month = date '2025-01-01' and onboarded >= 1),
  'Onboarded by month counts Lucas in January 2025');

-- ---------------------------------------------------------------------------
-- Refusals
-- ---------------------------------------------------------------------------
select throws_matching($$select public.import_staff((select id from t where key = 'import'))$$,
  'finished already', 'an import is confirmed once');
select throws_ok($$update public.staff_import_rows set included = false
                  where import_id = (select id from t where key = 'import')$$,
  '42501', null, 'a finished import''s rows are read-only');

with x as (insert into public.staff_imports (file_name) values ('again.xlsx') returning id)
insert into t select 'second', id from x;
insert into public.staff_import_rows (import_id, position, person) values
  ((select id from t where key = 'second'), 1, jsonb_build_object(
    'first_name', 'Lucas', 'last_name', 'Moreau', 'work_email', 'lucas.moreau@example.test',
    'start_date', '2025-01-06'));
select throws_matching($$select public.import_staff((select id from t where key = 'second'))$$,
  'already in the app', 'someone already in the app is refused (all or nothing)');
update public.staff_import_rows set person = person || jsonb_build_object(
  'work_email', 'new.person@example.test', 'start_date', (current_date + 30)::text)
where import_id = (select id from t where key = 'second');
select throws_matching($$select public.import_staff((select id from t where key = 'second'))$$,
  'in the future', 'a start date in the future is refused');
select public.discard_staff_import((select id from t where key = 'second'));
select is((select status from public.staff_imports where id = (select id from t where key = 'second')),
  'discarded', 'Discard drops an open import');

-- A normal request can never take the IMP series.
insert into public.requests (created_by, first_name, ticket_prefix, ticket_year)
values ('user_si_admin', 'Plain', 'IMP', 2020);
select ok((select ticket_prefix = 'UAM' and import_id is null and ticket_id like 'UAM-%' and state = 'draft'
           from public.requests where first_name = 'Plain' and created_by = 'user_si_admin'),
  'a request made in the app is always UAM, today''s year');

select * from finish();
rollback;

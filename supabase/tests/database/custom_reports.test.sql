-- Custom reports (F17a-1): saved reports are the maker's own, report readers
-- only (admin, approver, auditor), server times, every save / change /
-- delete audited, the 60-day purge and its daily job; Access held returns
-- every kind with the employee id (report readers only); exports may be
-- Excel. Run: pnpm db:test
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

insert into public.app_users (clerk_user_id, email, first_name, last_name) values
  ('user_cr_admin', 'cr-admin@example.test', 'Ada', 'Admin'),
  ('user_cr_approver', 'cr-approver@example.test', 'Moe', 'Approver'),
  ('user_cr_it', 'cr-it@example.test', 'Ivy', 'Operator');
insert into public.user_roles (clerk_user_id, role) values
  ('user_cr_admin', 'admin'), ('user_cr_approver', 'approver'),
  ('user_cr_it', 'it_operator');

-- One closed onboarding with Slack, a laptop and a door (triggers off).
insert into public.employees (work_email, first_name, last_name)
values ('rafiq.cr@example.test', 'Rafiq', 'CR');
alter table public.requests disable trigger user;
insert into public.requests
  (ticket_id, ticket_year, ticket_number, type, state, created_by, employee_id, first_name, last_name,
   work_email, country, form_version_id, created_at, closed_at)
values ('UAM-2026-950001', 2026, 950001, 'onboarding', 'closed', 'user_cr_admin',
  (select id from public.employees where work_email = 'rafiq.cr@example.test'), 'Rafiq', 'CR',
  'rafiq.cr@example.test', 'AE', (select id from public.form_versions where version = '4.2'),
  now() - interval '3 days', now() - interval '2 days');
alter table public.requests enable trigger user;
insert into public.employee_access_inventory
  (employee_id, kind, app_id, equipment_type_id, access_type_id, name, permission, granted_request_id, granted_at)
select e.id, x.kind::public.inventory_kind, x.app, x.equipment, x.access, x.name, x.permission,
  (select id from public.requests where ticket_id = 'UAM-2026-950001'), now() - interval '2 days'
from public.employees e,
  (values
    ('application', (select id from public.catalog_apps where name = 'Slack'), null::smallint, null::smallint, 'Slack', 'Regular Member'),
    ('equipment', null, (select id from public.equipment_types order by id limit 1), null, 'Laptop', null),
    ('access', null, null, (select id from public.physical_access_types order by id limit 1), 'Office door', null)
  ) as x (kind, app, equipment, access, name, permission)
where e.work_email = 'rafiq.cr@example.test';

-- A report of Moe's that was last changed 61 days ago (fixture times, trigger off).
alter table public.custom_reports disable trigger custom_reports_timestamps;
insert into public.custom_reports (id, user_id, title, definition, created_at, updated_at) values
  ('00000000-0000-0000-0000-00000000c001', 'user_cr_approver', 'Old', '{"parts":[]}',
   now() - interval '70 days', now() - interval '61 days');
alter table public.custom_reports enable trigger custom_reports_timestamps;

-- 1. The daily job ---------------------------------------------------------------------------------------
select is((select count(*)::int from cron.job where jobname = 'purge-old-custom-reports'), 1,
  'the 60-day purge runs every day');

set local role authenticated;

-- 2–9. Ada (admin): own reports, server times, audit ------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"user_cr_admin","role":"authenticated"}', true);
insert into public.custom_reports (id, title, definition, created_at)
values ('00000000-0000-0000-0000-00000000c002', 'Dubai joiners with Slack',
        '{"parts":[{"dataset":"people"},{"dataset":"people"}]}', '2020-01-01');
select is((select row(user_id, created_at > now() - interval '1 minute')::text
           from public.custom_reports where id = '00000000-0000-0000-0000-00000000c002'),
  row('user_cr_admin', true)::text, 'a new report is mine, with the server time');
select is((select array_agg(title) from public.custom_reports), array['Dubai joiners with Slack'],
  'I see only my own reports');
select throws_ok($$insert into public.custom_reports (user_id, title, definition)
                   values ('user_cr_approver', 'x', '{}')$$,
  '42501', null, 'no report in someone else''s name');
select throws_ok($$insert into public.custom_reports (title, definition) values ('x', '[]')$$,
  '23514', null, 'the definition is a JSON object');
select throws_ok($$insert into public.custom_reports (title, definition) values ('  ', '{}')$$,
  '23514', null, 'a report has a title');
update public.custom_reports set title = 'Dubai joiners with Slack & Monday.com'
where id = '00000000-0000-0000-0000-00000000c002';
delete from public.custom_reports where id = '00000000-0000-0000-0000-00000000c002';
reset role;
select is((select array_agg(action order by id) from public.audit_events
           where entity = 'custom_report' and entity_id = '00000000-0000-0000-0000-00000000c002'),
  array['report.custom_saved', 'report.custom_changed', 'report.custom_deleted'],
  'saved, changed and deleted — all audited');
select is((select diff from public.audit_events where action = 'report.custom_saved'
           and entity_id = '00000000-0000-0000-0000-00000000c002'),
  '{"parts": 2, "title": "Dubai joiners with Slack"}'::jsonb, 'the audit keeps the title and parts, no rows');
select is(private.audit_group('report.custom_saved'), 'records', 'listed under Records & PDFs');
set local role authenticated;

-- 10–12. Ivy (IT operator only): not a report reader --------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"user_cr_it","role":"authenticated"}', true);
select throws_ok($$insert into public.custom_reports (title, definition) values ('Mine', '{}')$$,
  '42501', null, 'custom reports are for report readers only');
select throws_ok($$select * from public.report_access_held()$$, '42501', null,
  'Access held: report readers only');
select throws_ok($$select public.log_report_export('custom', 'xlsx')$$, '42501', null,
  'exports: report readers only');

-- 13–17. Moe (approver): Access held with the employee id ---------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"user_cr_approver","role":"authenticated"}', true);
select is((select array_agg(kind::text order by kind) from public.report_access_held()
           where employee_id = (select id from public.employees where work_email = 'rafiq.cr@example.test')),
  array['application', 'equipment', 'access'], 'all three kinds, one call');
select is((select row(name, permission, granted_ticket_id)::text from public.report_access_held()
           where kind = 'application'
             and employee_id = (select id from public.employees where work_email = 'rafiq.cr@example.test')),
  row('Slack', 'Regular Member', 'UAM-2026-950001')::text, 'with the role and the ticket that granted it');
select is((select item_key from public.report_access_held()
           where kind = 'application'
             and employee_id = (select id from public.employees where work_email = 'rafiq.cr@example.test')),
  'app:' || (select id from public.catalog_apps where name = 'Slack'), 'the same item key as Access by application');
select is((select count(*)::int from public.report_access_held(1)), 1, 'the limit is respected');
select is((select array_agg(title) from public.custom_reports), array['Old'], 'Moe sees his own old report');

-- 18–19. Exports may be Excel ----------------------------------------------------------------------------------
select lives_ok($$select public.log_report_export('custom', 'xlsx', '{"id":"c002"}', 3)$$, 'Excel exports are logged');
select throws_ok($$select public.log_report_export('custom', 'docx')$$, '23514', null, 'other formats are refused');

-- 20. The purge -------------------------------------------------------------------------------------------------
reset role;
select is(private.purge_old_custom_reports(), 1, 'the 61-day-old report is deleted');

select * from finish();
rollback;

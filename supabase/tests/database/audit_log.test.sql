-- Audit log page and request activity (F11a): admins and auditors read the
-- log with filters, test users hidden by default, keyset paging, groups; the
-- CSV export is itself audited; the request activity is visible to whoever may
-- see the request — approvers on closed records only. Run: pnpm db:test
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

-- Fixtures (fake people only), inserted as the table owner.
insert into public.app_users (clerk_user_id, email, first_name, last_name) values
  ('user_al_admin',   'al-admin@example.test',   'Ada', 'Admin'),
  ('user_al_audrey',  'al-audrey@example.test',  'Audrey', 'Auditor'),
  ('user_al_abe',     'al-abe@example.test',     'Abe', 'Approver'),
  ('user_al_e2e',     'e2e.al+clerk_test@example.test', 'E2E', 'Tester');
insert into public.user_roles (clerk_user_id, role) values
  ('user_al_admin', 'admin'), ('user_al_admin', 'requester'), ('user_al_admin', 'it_operator'),
  ('user_al_audrey', 'auditor'),
  ('user_al_abe', 'approver'),
  ('user_al_e2e', 'approver');
insert into public.signature_assets (user_id, kind, source, typed_text) values
  ('user_al_admin', 'initials', 'typed', 'AA'),
  ('user_al_abe', 'initials', 'typed', 'AB');
-- A browser-test sign-in (written by the Clerk webhook in real life).
insert into public.audit_events (actor_id, action, entity, entity_id, source)
values ('user_al_e2e', 'session.created', 'session', 'sess_al_1', 'user');

-- Nina: onboarding with Slack, signed, returned, signed again with a note, closed.
-- Dora: a draft.
insert into public.requests
  (created_by, first_name, last_name, work_email, job_title, department_id, country,
   manager_name, requestor_name, effective_date)
values
  ('user_al_admin', 'Nina', 'Audit', 'nina.al@example.test', 'Analyst',
   (select id from public.departments where name = 'Sales'), 'IT',
   'Mara Manager', 'Rita Requestor', date '2026-01-05'),
  ('user_al_admin', 'Dora', 'Draft', 'dora.al@example.test', 'Analyst',
   (select id from public.departments where name = 'Sales'), 'IT',
   'Mara Manager', 'Rita Requestor', date '2026-01-05');
create temporary table ids as
  select id, first_name, ticket_id from public.requests where work_email in ('nina.al@example.test', 'dora.al@example.test');
grant select on ids to authenticated;
insert into public.request_access_items (request_id, app_id, action, permission)
select (select id from ids where first_name = 'Nina'), a.id, 'Grant', 'Regular Member'
from public.catalog_apps a where a.name = 'Slack';

-- Form v4.2 (F27): new requests need an Office before Review & sign.
update public.requests set office_id = (select id from public.offices where name = 'Dubai')
where office_id is null and state not in ('closed', 'cancelled');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_al_admin","role":"authenticated"}', true);
select public.transition_request(id, 'in_execution') from ids where first_name = 'Nina';
insert into public.execution_confirmations (request_id, executed_by, checks)
select id, 'user_al_admin', '{"access_provisioned": true, "devices_enrolled": true, "security_controls": true}'
from ids where first_name = 'Nina';
select public.sign_request(id, public.request_snapshot_preview(id)) from ids where first_name = 'Nina';
select set_config('request.jwt.claims', '{"sub":"user_al_abe","role":"authenticated"}', true);
select public.return_request(id, 'Why does Nina need Slack?', '{5}') from ids where first_name = 'Nina';
select set_config('request.jwt.claims', '{"sub":"user_al_admin","role":"authenticated"}', true);
select public.sign_request(id, public.request_snapshot_preview(id), 'Slack is for the sales team.')
from ids where first_name = 'Nina';
reset role;
create temporary table snap as
  select private.request_snapshot_data(id) as data from ids where first_name = 'Nina';
grant select on snap to authenticated;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_al_abe","role":"authenticated"}', true);
select public.confirm_request((select id from ids where first_name = 'Nina'), (select data from snap));

-- 1–3. Helpers ---------------------------------------------------------------
reset role;
select ok(private.is_test_email('e2e.admin+clerk_test@laine.ai'), 'e2e.*+clerk_test is a test user');
select ok(not private.is_test_email('rbh+approver@laine.ai'), 'a +alias without clerk_test is a real user');
select is(
  array[private.audit_group('request.updated'), private.audit_group('request.signed'),
        private.audit_group('request.returned'), private.audit_group('signature.added'),
        private.audit_group('record.downloaded'), private.audit_group('audit.exported'),
        private.audit_group('session.created'), private.audit_group('account.password_changed'),
        private.audit_group('catalog.app_added'), private.audit_group('role.granted'),
        private.audit_group('inventory.updated')],
  array['requests', 'signatures', 'signatures', 'signatures', 'records', 'records',
        'accounts', 'accounts', 'admin', 'admin', 'requests'],
  'actions fall into the five filter groups');

-- 4–12. The page, as the admin -------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_al_admin","role":"authenticated"}', true);
select is((select count(*)::int from public.audit_log(p_limit => 200) where actor_id = 'user_al_e2e'), 0,
  'test users are hidden by default');
select is((select count(*)::int from public.audit_log(p_actor => 'user_al_e2e', p_hide_test => false)), 1,
  'and shown when asked');
select is((select count(*)::int from public.audit_log(p_limit => 200)
           where action = 'user.created' and entity_id = 'user_al_e2e'), 0,
  'the creation of a test account is hidden with it');
select is((select count(*)::int from public.audit_log(p_actor => 'system', p_limit => 200) where actor_id is not null), 0,
  'Who = System keeps only events without a person');
select is((select array_agg(distinct action order by action)
           from public.audit_log(p_groups => '{signatures}', p_search => (select ticket_id from ids where first_name = 'Nina'))),
  array['request.confirmed', 'request.returned', 'request.signed'],
  'the Signatures & approvals group of one request');
select is((select row(ticket_id, employee_name, request_type::text)::text
           from public.audit_log(p_search => (select ticket_id from ids where first_name = 'Nina'))
           where action = 'request.created'),
  row((select ticket_id from ids where first_name = 'Nina'), 'Nina Audit', 'onboarding')::text,
  'a request event carries its ticket, person and type');
select is((select actor_name || ' · ' || array_to_string(actor_roles, ', ')
           from public.audit_log(p_groups => '{signatures}', p_actor => 'user_al_abe') limit 1),
  'Abe Approver · approver', 'the actor''s name and roles come with each row');
select ok((select bool_and(created_at >= now() - interval '1 minute')
           from public.audit_log(p_from => now() - interval '1 minute', p_limit => 200)),
  'the date filter applies');

reset role;
create temporary table page1 as select * from public.audit_log(p_limit => 1) limit 0;
create temporary table page2 as select * from page1;
grant all on page1, page2 to authenticated;
set local role authenticated;
insert into page1
  select * from public.audit_log(p_search => (select ticket_id from ids where first_name = 'Nina'), p_limit => 3);
insert into page2
  select * from public.audit_log(p_search => (select ticket_id from ids where first_name = 'Nina'), p_limit => 3,
    p_before_at => (select created_at from page1 order by created_at, id limit 1),
    p_before_id => (select id from page1 order by created_at, id limit 1));
select ok((select count(*) from page2) > 0 and not exists (select 1 from page1 join page2 using (id))
          and (select max(id) from page2) < (select min(id) from page1),
  'the next page continues where the first stopped');
select ok((select bool_and(total_count = (select total_count from page1 limit 1)) from page2)
          and (select total_count from page1 limit 1) > 3,
  'every page reports the same filtered total');

-- 13–14. Not for approvers -----------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"user_al_abe","role":"authenticated"}', true);
select throws_ok($$select * from public.audit_log()$$, '42501', null, 'an approver cannot read the audit log');
select throws_ok($$select * from public.export_audit_log()$$, '42501', null, 'nor export it');

-- 15–17. The export, as the auditor -------------------------------------------
reset role;
create temporary table exported as
  select * from private.audit_rows(null, null, null, null, null, null, true) limit 0;
grant all on exported to authenticated;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_al_audrey","role":"authenticated"}', true);
insert into exported
  select * from public.export_audit_log(p_groups => '{signatures}',
    p_search => (select ticket_id from ids where first_name = 'Nina'));
select is((select count(*)::int from exported), 4, 'the export follows the filters (signed twice, returned, confirmed)');
select is((select diff -> 'rows' from public.audit_events
           where action = 'audit.exported' and actor_id = 'user_al_audrey'),
  '4'::jsonb, 'the export is recorded with its row count');
select is((select diff #>> '{filters,groups,0}' from public.audit_events
           where action = 'audit.exported' and actor_id = 'user_al_audrey'),
  'signatures', 'and with its filters');

-- 18–24. Request activity -------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"user_al_admin","role":"authenticated"}', true);
select ok((select count(*) from public.request_activity((select id from ids where first_name = 'Dora'))) >= 1,
  'the IT side sees the activity of a draft');
select set_config('request.jwt.claims', '{"sub":"user_al_abe","role":"authenticated"}', true);
select throws_ok($$select * from public.request_activity((select id from ids where first_name = 'Dora'))$$,
  '42501', null, 'an approver never sees a draft''s activity');
select ok((select bool_and(ordered) and bool_or(action = 'inventory.updated')
           from (select action, id < lag(id, 1, id + 1) over () as ordered
                 from public.request_activity((select id from ids where first_name = 'Nina'))) x),
  'an approver sees a record''s activity, newest first, with the inventory update');
select is((select row(note, flagged_sections, actor_name)::text
           from public.request_activity((select id from ids where first_name = 'Nina'))
           where action = 'request.returned'),
  row('Why does Nina need Slack?', '{5}'::smallint[], 'Abe Approver')::text,
  'a return shows its comment and flagged section');
select is((select note from public.request_activity((select id from ids where first_name = 'Nina'))
           where action = 'request.signed' and note is not null),
  'Slack is for the sales team.', 'signing again shows the note for the approver');
select set_config('request.jwt.claims', '{"sub":"user_al_audrey","role":"authenticated"}', true);
select ok((select count(*) from public.request_activity((select id from ids where first_name = 'Dora'))) >= 1,
  'an auditor sees every request''s activity');
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok($$select * from public.request_activity((select id from ids where first_name = 'Nina'))$$,
  '42501', null, 'nobody signed in sees nothing');

select * from finish();
rollback;

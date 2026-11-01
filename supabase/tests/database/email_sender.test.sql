-- Email sender (F23b-2): outbox_email_facts() gives the sender each email's
-- facts and says when one is no longer due; mark_outbox_skipped(); the
-- 5-minute pg_cron job calls the sender only when something is due and the
-- Vault holds its URL + secret. Run: pnpm db:test
begin;
create extension if not exists pgtap with schema extensions;
select plan(23);

-- Only this test's approvers (browser-test users come back on rollback).
delete from public.user_roles where role = 'approver';

insert into public.app_users (clerk_user_id, email, first_name, last_name) values
  ('user_es_admin', 'es-admin@example.test', 'Ada', 'Admin'),
  ('user_es_abe',   'es-abe@example.test',   'Abe', 'Approver');
insert into public.user_roles (clerk_user_id, role) values
  ('user_es_admin', 'admin'), ('user_es_admin', 'requester'), ('user_es_admin', 'it_operator'),
  ('user_es_abe', 'approver');
insert into public.signature_assets (user_id, kind, source, typed_text) values
  ('user_es_admin', 'initials', 'typed', 'AA'),
  ('user_es_abe', 'initials', 'typed', 'AB');

insert into public.requests
  (created_by, first_name, last_name, work_email, job_title, department_id, country, office_id,
   manager_name, requestor_name, effective_date)
values ('user_es_admin', 'Ella', 'Facts', 'ella.es@example.test', 'Analyst',
  (select id from public.departments order by id limit 1), 'AE',
  (select id from public.offices where name = 'Dubai'), 'Mara Manager', 'Rita Requestor', date '2026-11-02');
create temporary table ids as
  select id, ticket_id from public.requests where work_email = 'ella.es@example.test';
grant select on ids to authenticated, service_role;

-- Facts of the latest email of a kind (as the sender sees them).
create function pg_temp.facts(p_kind text) returns jsonb language sql as $$
  select public.outbox_email_facts(max(id)) from public.email_outbox where kind = p_kind
$$;
grant execute on function pg_temp.facts(text) to service_role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_es_admin","role":"authenticated"}', true);
select public.transition_request(id, 'in_execution') from ids;
insert into public.execution_confirmations (request_id, executed_by, checks)
select id, 'user_es_admin', '{"access_provisioned": true, "devices_enrolled": true, "security_controls": true}'
from ids;
select public.sign_request(id, public.request_snapshot_preview(id)) from ids;

select throws_ok(
  $$select public.outbox_email_facts((select max(id) from public.email_outbox))$$,
  '42501', null, 'a signed-in person can''t read the email facts (sender only)');
select throws_ok($$select public.mark_outbox_skipped(1, 'x')$$, '42501', null,
  '… nor skip an email');

-- ---------------------------------------------------------------------------
-- Waiting: the request, who signed it
-- ---------------------------------------------------------------------------
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(pg_temp.facts('waiting') ->> 'due', 'true', 'waiting: due');
select is(
  pg_temp.facts('waiting') -> 'facts' -> 'request' ->> 'ticket',
  (select ticket_id from ids), '… with the ticket');
select is(
  (select f -> 'request' ->> 'firstName' || ' ' || (f -> 'request' ->> 'lastName') || ' · '
          || (f -> 'request' ->> 'type') || ' · ' || (f -> 'request' ->> 'effectiveDate')
   from (select pg_temp.facts('waiting') -> 'facts' as f) x),
  'Ella Facts · onboarding · 2026-11-02', '… the person, type and effective date');
select is(pg_temp.facts('waiting') -> 'facts' -> 'itSigner' ->> 'name', 'Ada Admin',
  '… and who signed section 9');
select ok(pg_temp.facts('waiting') -> 'facts' -> 'request' ->> 'waitingSince' is not null,
  '… waiting since (for reminders)');

-- ---------------------------------------------------------------------------
-- Returned: the comment and flagged sections; the old "waiting" is skipped
-- ---------------------------------------------------------------------------
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_es_abe","role":"authenticated"}', true);
select public.return_request(id, 'Please check Slack.', '{5,2}') from ids;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(
  (select f ->> 'by' || ' · ' || (f ->> 'comment') || ' · ' || (f ->> 'flagged')
   from (select pg_temp.facts('returned') -> 'facts' -> 'decision' as f) x),
  'Abe Approver · Please check Slack. · [2, 5]', 'returned: who, the comment, the flagged sections');
select is(
  (select public.outbox_email_facts(min(id)) ->> 'why' from public.email_outbox where kind = 'waiting'),
  'no longer waiting for confirmation', 'the earlier "waiting" is no longer due');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_es_admin","role":"authenticated"}', true);
select public.sign_request(id, public.request_snapshot_preview(id), 'Checked.') from ids;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(pg_temp.facts('returned') ->> 'why', 'already signed again',
  'signed again before the email went: the return email is no longer due');

-- ---------------------------------------------------------------------------
-- Closed: who confirmed
-- ---------------------------------------------------------------------------
reset role;
create temporary table snap as select private.request_snapshot_data(id) as data from ids;
grant select on snap to authenticated;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_es_abe","role":"authenticated"}', true);
select public.confirm_request((select id from ids), (select data from snap));
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select ok(
  (select f ->> 'due' = 'true' and f -> 'facts' -> 'decision' ->> 'by' = 'Abe Approver'
          and f -> 'facts' -> 'decision' ->> 'at' is not null
   from (select pg_temp.facts('closed') as f) x),
  'closed: due, with who confirmed and when');

-- ---------------------------------------------------------------------------
-- SLA: counts and the device still to return; finished = no longer due
-- ---------------------------------------------------------------------------
reset role;
alter table public.requests disable trigger user;
insert into public.requests
  (ticket_id, ticket_year, ticket_number, type, state, created_by, first_name, last_name,
   work_email, form_version_id, sla_timeline, sla_due_at)
values ('UAM-2026-940001', 2026, 940001, 'offboarding', 'in_execution', 'user_es_admin', 'Leo', 'Leaving',
   'leo.es@example.test', (select id from public.form_versions order by id limit 1), 'within_24h',
   now() + interval '2 hours');
alter table public.requests enable trigger user;
alter table public.request_equipment_items disable trigger user;
insert into public.request_equipment_items (request_id, action, type_id, type_name, return_status)
values ((select id from public.requests where ticket_id = 'UAM-2026-940001'), 'Return',
  (select id from public.equipment_types order by id limit 1), 'Laptop', 'pending');
alter table public.request_equipment_items enable trigger user;

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select public.queue_scheduled_notifications();
select is(
  (select f ->> 'timeline' || ' · ' || (f ->> 'devicesPending') || ' · ' || (f ->> 'done') || '/' || (f ->> 'total')
   from (select pg_temp.facts('sla_due') -> 'facts' -> 'sla' as f) x),
  'within_24h · 1 · 0/0', 'SLA due: the timeline, removals done / total, devices still to return');
select ok(pg_temp.facts('sla_due') -> 'facts' -> 'sla' ->> 'dueAt' is not null, '… and the deadline');

reset role;
alter table public.requests disable trigger user;
update public.requests set state = 'cancelled' where ticket_id = 'UAM-2026-940001';
alter table public.requests enable trigger user;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(pg_temp.facts('sla_due') ->> 'why', 'the removals are finished',
  'a cancelled offboarding: the SLA email is no longer due');

-- ---------------------------------------------------------------------------
-- Test email; a deactivated person
-- ---------------------------------------------------------------------------
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_es_admin","role":"authenticated"}', true);
select public.queue_test_email();
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select ok(
  (select f ->> 'due' = 'true' and f -> 'facts' ->> 'kind' = 'test' and f -> 'facts' -> 'request' = 'null'::jsonb
   from (select pg_temp.facts('test') as f) x),
  'test email: due, no request');

reset role;
update public.app_users set active = false where clerk_user_id = 'user_es_abe';
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(
  (select public.outbox_email_facts(max(id)) ->> 'why' from public.email_outbox where to_user = 'user_es_abe'),
  'the person was deactivated', 'an email to a deactivated person is no longer due');
select is(public.outbox_email_facts(-1), null, 'an unknown email: null');

-- ---------------------------------------------------------------------------
-- Skipped
-- ---------------------------------------------------------------------------
select public.claim_outbox(100);
select public.mark_outbox_skipped((select max(id) from public.email_outbox where kind = 'sla_due'),
  'the removals are finished');
select ok(
  (select status = 'skipped' and last_error = 'the removals are finished'
   from public.email_outbox where id = (select max(id) from public.email_outbox where kind = 'sla_due')),
  'skipped: recorded with the reason');
select public.mark_outbox_skipped((select max(id) from public.email_outbox where kind = 'sla_due'), 'again');
select is(
  (select last_error from public.email_outbox where id = (select max(id) from public.email_outbox where kind = 'sla_due')),
  'the removals are finished', 'only an email being sent can be skipped');

-- ---------------------------------------------------------------------------
-- The 5-minute job
-- ---------------------------------------------------------------------------
reset role;
select is(
  (select schedule from cron.job where jobname = 'send-notifications'),
  '*/5 * * * *', 'pg_cron calls the sender every 5 minutes');

update public.email_outbox set status = 'pending', send_after = now() - interval '1 minute'
where id = (select min(id) from public.email_outbox);
select is(private.call_email_sender(), null, 'an email is due but the Vault has no URL / secret: nothing called');

select vault.create_secret('http://127.0.0.1:9/api/notifications/send', 'email_sender_url');
select vault.create_secret('test-secret', 'email_sender_secret');
select ok(private.call_email_sender() is not null, 'with URL + secret: the sender route is called');

update public.email_outbox set status = 'sent' where status in ('pending', 'sending');
select is(private.call_email_sender(), null, 'nothing due: nothing called');

select * from finish();
rollback;

-- Email notifications (F23a): the outbox fills from the real workflow (signed
-- → every approver who may confirm; returned / closed → the IT signer), the
-- schedule adds reminders and SLA emails once, the sender claims and marks
-- rows (3 tries), switches turn emails off. Run: pnpm db:test
begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

-- Only this test's approvers (browser-test users come back on rollback).
delete from public.user_roles where role = 'approver';

insert into public.app_users (clerk_user_id, email, first_name, last_name) values
  ('user_eo_admin', 'eo-admin@example.test', 'Ada', 'Admin'),
  ('user_eo_abe',   'eo-abe@example.test',   'Abe', 'Approver'),
  ('user_eo_bea',   'eo-bea@example.test',   'Bea', 'Backup'),
  ('user_eo_gone',  'eo-gone@example.test',  'Gone', 'Approver');
insert into public.user_roles (clerk_user_id, role) values
  ('user_eo_admin', 'admin'), ('user_eo_admin', 'requester'), ('user_eo_admin', 'it_operator'),
  -- The admin is an approver too: never for a request they prepared.
  ('user_eo_admin', 'approver'),
  ('user_eo_abe', 'approver'), ('user_eo_bea', 'approver'), ('user_eo_gone', 'approver');
update public.app_users set active = false where clerk_user_id = 'user_eo_gone';
insert into public.signature_assets (user_id, kind, source, typed_text) values
  ('user_eo_admin', 'initials', 'typed', 'AA'),
  ('user_eo_abe', 'initials', 'typed', 'AB');

insert into public.requests
  (created_by, first_name, last_name, work_email, job_title, department_id, country, office_id,
   manager_name, requestor_name, effective_date)
select 'user_eo_admin', x.first, 'Mail', lower(x.first) || '.eo@example.test', 'Analyst',
  (select id from public.departments order by id limit 1), 'AE',
  (select id from public.offices where name = 'Dubai'), 'Mara Manager', 'Rita Requestor', date '2026-11-02'
from (values ('Nina'), ('Dora')) as x (first);
create temporary table ids as
  select id, first_name from public.requests where work_email like '%.eo@example.test';
grant select on ids to authenticated, service_role;
create temporary table claimed (id bigint);
grant all on claimed to service_role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_eo_admin","role":"authenticated"}', true);
select public.transition_request(id, 'in_execution') from ids;
insert into public.execution_confirmations (request_id, executed_by, checks)
select id, 'user_eo_admin', '{"access_provisioned": true, "devices_enrolled": true, "security_controls": true}'
from ids;

-- ---------------------------------------------------------------------------
-- Signed → "waiting" to every approver who may confirm
-- ---------------------------------------------------------------------------
select public.sign_request(id, public.request_snapshot_preview(id)) from ids where first_name = 'Nina';
select is(
  (select array_agg(to_user order by to_user) from public.email_outbox
   where kind = 'waiting' and request_id = (select id from ids where first_name = 'Nina')),
  array['user_eo_abe', 'user_eo_bea'],
  'signed: every active approver gets "waiting" — not who prepared it, not a deactivated one');
select ok(
  (select bool_and(status = 'pending' and to_email like 'eo-%@example.test' and attempts = 0)
   from public.email_outbox where kind = 'waiting'),
  '… pending, with the address copied');

-- A switched-off email isn't queued.
select public.admin_save_notification_settings(false, true, true, true, true, true);
select ok(
  exists (select 1 from public.audit_events where action = 'notification.settings_changed'
          and diff -> 'before' ->> 'waiting' = 'true' and diff -> 'after' ->> 'waiting' = 'false'),
  'changing the switches is audited');
select public.sign_request(id, public.request_snapshot_preview(id)) from ids where first_name = 'Dora';
select is(
  (select count(*) from public.email_outbox where request_id = (select id from ids where first_name = 'Dora')),
  0::bigint, '"waiting" switched off: Dora''s signing queues nothing');
select public.admin_save_notification_settings(true, true, true, true, true, true);

-- ---------------------------------------------------------------------------
-- Returned → the IT signer; signed again → "waiting" again; closed → IT signer
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"user_eo_abe","role":"authenticated"}', true);
select public.return_request(id, 'Please check Slack.', '{5}') from ids where first_name = 'Nina';
select set_config('request.jwt.claims', '{"sub":"user_eo_admin","role":"authenticated"}', true);
select is(
  (select to_user from public.email_outbox where kind = 'returned'),
  'user_eo_admin', 'returned: the IT signer is told');
select ok(
  (select details ->> 'approval_id' = (select id::text from public.approvals where decision = 'returned')
   from public.email_outbox where kind = 'returned'),
  '… with the return (its comment is read when sending)');

select public.sign_request(id, public.request_snapshot_preview(id), 'Checked.') from ids where first_name = 'Nina';
select is(
  (select count(*) from public.email_outbox
   where kind = 'waiting' and request_id = (select id from ids where first_name = 'Nina')),
  4::bigint, 'signed again after a return: the approvers are told again');

reset role;
create temporary table snap as select private.request_snapshot_data(id) as data from ids where first_name = 'Nina';
grant select on snap to authenticated;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_eo_abe","role":"authenticated"}', true);
select public.confirm_request((select id from ids where first_name = 'Nina'), (select data from snap));
-- Approvers don't read the outbox; admins do.
select is((select count(*) from public.email_outbox), 0::bigint, 'an approver reads no outbox rows');
select set_config('request.jwt.claims', '{"sub":"user_eo_admin","role":"authenticated"}', true);
select is(
  (select array_agg(to_user) from public.email_outbox where kind = 'closed'),
  array['user_eo_admin'], 'closed: the IT signer is told, once');
select ok((select count(*) from public.email_outbox) >= 6, 'an admin reads the outbox');
select throws_ok(
  $$insert into public.email_outbox (kind, to_user, to_email, dedupe_key) values ('test', 'user_eo_admin', 'x@example.test', 'x')$$,
  '42501', null, 'nobody writes the outbox directly');
select throws_ok($$select * from public.claim_outbox()$$, '42501', null,
  'only the server (service role) sends');
select throws_ok($$select public.queue_scheduled_notifications()$$, '42501', null,
  'only the schedule queues reminders');

-- Test email: admin only, to themselves.
select lives_ok($$select public.queue_test_email()$$, 'an admin queues a test email');
select is(
  (select to_user from public.email_outbox where kind = 'test'),
  'user_eo_admin', '… to themselves');
select set_config('request.jwt.claims', '{"sub":"user_eo_abe","role":"authenticated"}', true);
select throws_ok($$select public.queue_test_email()$$, '42501', null, 'an approver can''t');
select throws_ok($$select public.admin_save_notification_settings(false, false, false, false, false, false)$$,
  '42501', null, 'nor change the switches');

-- ---------------------------------------------------------------------------
-- Scheduled: reminders after 2 days (once a day), SLA due soon / missed
-- ---------------------------------------------------------------------------
reset role;
-- Dora has waited 3 days.
alter table public.requests disable trigger user;
update public.requests set state_changed_at = now() - interval '3 days'
where id = (select id from ids where first_name = 'Dora');
-- Two open offboardings: due in 2 hours, and 1 hour overdue (nothing ticked).
insert into public.requests
  (ticket_id, ticket_year, ticket_number, type, state, created_by, first_name, last_name,
   work_email, form_version_id, sla_timeline, sla_due_at)
values
  ('UAM-2026-930001', 2026, 930001, 'offboarding', 'in_execution', 'user_eo_admin', 'Soon', 'Due',
   'soon.eo@example.test', (select id from public.form_versions order by id limit 1), 'within_24h', now() + interval '2 hours'),
  ('UAM-2026-930002', 2026, 930002, 'offboarding', 'in_execution', 'user_eo_admin', 'Past', 'Due',
   'past.eo@example.test', (select id from public.form_versions order by id limit 1), 'within_24h', now() - interval '1 hour'),
  ('UAM-2026-930003', 2026, 930003, 'offboarding', 'in_execution', 'user_eo_admin', 'Later', 'Due',
   'later.eo@example.test', (select id from public.form_versions order by id limit 1), 'within_24h', now() + interval '2 days');
alter table public.requests enable trigger user;

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select ok(public.queue_scheduled_notifications() >= 4, 'the schedule queues what is due');
select is(
  (select array_agg(to_user order by to_user) from public.email_outbox
   where kind = 'reminder' and request_id = (select id from ids where first_name = 'Dora')),
  array['user_eo_abe', 'user_eo_bea'], 'reminders: Dora has waited 3 days → every approver');
select is(
  (select kind from public.email_outbox o join public.requests r on r.id = o.request_id
   where r.first_name = 'Soon'), 'sla_due', 'SLA due within 6 hours → "due soon" to IT');
select is(
  (select kind || ':' || to_user from public.email_outbox o join public.requests r on r.id = o.request_id
   where r.first_name = 'Past'), 'sla_missed:user_eo_admin', 'deadline passed, not finished → "missed"');
select is(
  (select count(*) from public.email_outbox o join public.requests r on r.id = o.request_id
   where r.first_name = 'Later'), 0::bigint, 'a deadline 2 days away: nothing yet');
select is(public.queue_scheduled_notifications(), 0, 'run again the same day: nothing twice');

-- ---------------------------------------------------------------------------
-- The sender: claim, sent, failed after 3 tries
-- ---------------------------------------------------------------------------
insert into claimed select id from public.claim_outbox(100);
select ok(
  (select count(*) from claimed) >= 10
  and not exists (select 1 from public.email_outbox where status = 'pending' and send_after <= now()),
  'claim takes the due emails and marks them "sending"');
select is((select count(*) from public.claim_outbox(100)), 0::bigint, 'a second sender gets none of them');

select public.mark_outbox_sent((select min(id) from claimed), 're_123');
select ok(
  (select status = 'sent' and sent_at is not null and provider_id = 're_123'
   from public.email_outbox where id = (select min(id) from claimed))
  and exists (select 1 from public.audit_events where action = 'notification.sent'
              and entity_id = (select min(id)::text from claimed)),
  'sent: recorded with the provider id and audited');

select public.mark_outbox_failed((select max(id) from claimed), 'timeout');
select ok(
  (select status = 'pending' and attempts = 1 and send_after > now() and last_error = 'timeout'
   from public.email_outbox where id = (select max(id) from claimed)),
  'a failed try waits and is tried again');
reset role;
update public.email_outbox set send_after = now() - interval '1 second' where id = (select max(id) from claimed);
set local role service_role;
select public.claim_outbox(100);
select public.mark_outbox_failed((select max(id) from claimed), 'timeout');
reset role;
update public.email_outbox set send_after = now() - interval '1 second' where id = (select max(id) from claimed);
set local role service_role;
select public.claim_outbox(100);
select public.mark_outbox_failed((select max(id) from claimed), 'mailbox full');
select ok(
  (select status = 'failed' and attempts = 3 and last_error = 'mailbox full'
   from public.email_outbox where id = (select max(id) from claimed)),
  'after the third failed try: failed, with the reason');
select ok(
  exists (select 1 from public.audit_events where action = 'notification.failed'
          and entity_id = (select max(id)::text from claimed)),
  '… audited');

select * from finish();
rollback;

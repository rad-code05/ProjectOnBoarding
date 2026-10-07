-- Requests, employees, departments and form v4.1 (F01b).
-- Run: pnpm db:test   (needs the local database: pnpm db:start)
begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

-- Fixtures (fake people only), inserted as the table owner.
insert into public.app_users (clerk_user_id, email, first_name, last_name) values
  ('user_rq_admin',    'rq-admin@example.test',    'Ada', 'Admin'),
  ('user_rq_approver', 'rq-approver@example.test', 'Abe', 'Approver'),
  ('user_rq_auditor',  'rq-auditor@example.test',  'Aud', 'Itor'),
  ('user_rq_norole',   'rq-norole@example.test',   'No',  'Role');
insert into public.user_roles (clerk_user_id, role) values
  ('user_rq_admin', 'admin'), ('user_rq_admin', 'requester'), ('user_rq_admin', 'it_operator'),
  ('user_rq_approver', 'approver'),
  ('user_rq_auditor', 'auditor');

-- ---------------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------------
select results_eq(
  $$select name from public.departments order by sort_order$$,
  array['Engineering', 'Tech', 'Sales', 'Operations', 'Marketing', 'Compliance', 'Admin'],
  'the seven departments are seeded in order');
select is(
  (select version from public.form_versions where is_current), '4.1',
  'form v4.1 is the current version');
select ok(
  (select count(*) = 17 from public.form_fields f join public.form_versions v on v.id = f.form_version_id where v.version = '4.1'),
  'form v4.1 defines the 17 fields of sections 1–2');
select ok(
  exists (select 1 from public.form_fields where key = 'country' and required),
  'Country is a required field (agreed 2026-09-30)');
select throws_ok(
  $$update public.form_fields set label = 'x'$$, '42501', null,
  'published form fields cannot be changed');

-- ---------------------------------------------------------------------------
-- Ticket IDs and server-set values (as owner)
-- ---------------------------------------------------------------------------
insert into public.requests (created_by, ticket_id, version, created_at)
values ('user_rq_admin', 'FAKE-1', 99, '2000-01-01');
insert into public.requests (created_by) values ('user_rq_admin');

select ok(
  (select bool_and(ticket_id ~ '^UAM-\d{4}-\d{6}$') from public.requests where created_by = 'user_rq_admin'),
  'ticket IDs look like UAM-YYYY-NNNNNN (a supplied ID is ignored)');
select is(
  (select count(distinct ticket_number)::int from public.requests where created_by = 'user_rq_admin'), 2,
  'each request gets its own number');
select ok(
  (select bool_and(version = 1 and created_at > now() - interval '1 minute' and state = 'draft')
   from public.requests where created_by = 'user_rq_admin'),
  'new requests start as version 1 drafts with the server time (never backdated)');
select is(
  (select assignee_id from public.requests where created_by = 'user_rq_admin' limit 1), 'user_rq_admin',
  'the assignee defaults to the creator');

-- The counter is per year (a new year starts again at 1): continue this year's.
update private.ticket_counters set last_number = 41
where year = extract(year from now() at time zone private.company_timezone());
insert into public.requests (created_by, first_name) values ('user_rq_admin', 'Counter');
select ok(
  (select ticket_number = 42 and ticket_id like 'UAM-____-000042' from public.requests where first_name = 'Counter'),
  'the next ticket continues this year''s counter (UAM-YYYY-000042)');

-- ---------------------------------------------------------------------------
-- Updates: version, guards, employee link, audit
-- ---------------------------------------------------------------------------
update public.requests set first_name = 'Anna', last_name = 'Keller', work_email = 'anna.keller@example.test'
where ticket_id = (select min(ticket_id) from public.requests where created_by = 'user_rq_admin');

select is(
  (select version from public.requests where work_email = 'anna.keller@example.test'), 2,
  'every save raises the version (optimistic locking)');
select ok(
  (select employee_id is not null from public.requests where work_email = 'anna.keller@example.test')
  and exists (select 1 from public.employees where work_email = 'anna.keller@example.test'),
  'a work email creates and links the employee');
select ok(
  exists (select 1 from public.audit_events
          where action = 'request.updated'
            and diff -> 'changes' -> 'first_name' ->> 'after' = 'Anna'),
  'changes are audited field by field (before → after)');
select throws_ok(
  $$update public.requests set ticket_id = 'UAM-1999-000001' where work_email = 'anna.keller@example.test'$$,
  '42501', null, 'the ticket ID can never change');
select throws_ok(
  $$update public.requests set state = 'in_execution' where work_email = 'anna.keller@example.test'$$,
  '42501', null, 'state changes are refused until the workflow exists (F04)');
select throws_ok(
  $$insert into public.requests (created_by, country) values ('user_rq_admin', 'ch')$$,
  '23514', null, 'country must be a two-letter upper-case code');

-- A request already waiting for the approver (as owner, for the RLS checks below).
insert into public.requests (created_by, state, first_name) values ('user_rq_admin', 'pending_confirmation', 'Pia');

-- ---------------------------------------------------------------------------
-- Admin / requester
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_rq_admin","role":"authenticated"}', true);

select lives_ok(
  $$insert into public.requests (created_by) values ('user_rq_admin')$$,
  'a requester creates a draft in their own name');
select throws_ok(
  $$insert into public.requests (created_by) values ('user_rq_approver')$$,
  '42501', null, 'nobody creates a request in someone else''s name');
select throws_ok(
  $$insert into public.requests (created_by, state) values ('user_rq_admin', 'closed')$$,
  '42501', null, 'new requests can only be drafts');
select ok(
  (select count(*) >= 4 from public.requests), 'the IT side reads all requests');
select is_empty(
  $$update public.requests set job_title = 'x' where work_email = 'anna.keller@example.test' and version = 1 returning id$$,
  'a save with an outdated version changes nothing');
select throws_ok(
  $$delete from public.requests$$, '42501', null, 'requests are never deleted');

-- ---------------------------------------------------------------------------
-- Approver: never drafts
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"user_rq_approver","role":"authenticated"}', true);
select results_eq(
  $$select first_name from public.requests$$, array['Pia'],
  'the approver sees only the request awaiting confirmation — no drafts');
select throws_ok(
  $$insert into public.requests (created_by) values ('user_rq_approver')$$,
  '42501', null, 'an approver cannot create requests');

-- ---------------------------------------------------------------------------
-- Auditor reads; a user without roles sees nothing
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"user_rq_auditor","role":"authenticated"}', true);
select ok((select count(*) >= 4 from public.requests), 'the auditor reads all requests');

select set_config('request.jwt.claims', '{"sub":"user_rq_norole","role":"authenticated"}', true);
select is_empty($$select * from public.requests$$, 'a user without a role sees no requests');

select * from finish();
rollback;

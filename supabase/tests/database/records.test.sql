-- PDF records (F08a) and the company timezone (D3): who may set the timezone,
-- who may store / read / record a PDF, one PDF per closed request, downloads
-- audited. Run: pnpm db:test   (needs the local database: pnpm db:start)
begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

-- Fixtures (fake people only), inserted as the table owner.
insert into public.app_users (clerk_user_id, email, first_name, last_name) values
  ('user_rc_admin', 'rc-admin@example.test', 'Ada',  'Admin'),
  ('user_rc_abe',   'rc-abe@example.test',   'Abe',  'Approver'),
  ('user_rc_bea',   'rc-bea@example.test',   'Bea',  'Backup'),
  ('user_rc_ivan',  'rc-ivan@example.test',  'Ivan', 'Operator');
insert into public.user_roles (clerk_user_id, role) values
  ('user_rc_admin', 'admin'), ('user_rc_admin', 'requester'), ('user_rc_admin', 'it_operator'),
  ('user_rc_abe', 'approver'),
  ('user_rc_bea', 'approver'),
  ('user_rc_ivan', 'it_operator');

insert into public.requests
  (created_by, first_name, last_name, work_email, job_title, department_id, country,
   manager_name, requestor_name, effective_date)
select 'user_rc_admin', f, 'Test', lower(f) || '.test@example.test', 'Analyst',
  (select id from public.departments where name = 'Engineering'), 'CH',
  'Mara Manager', 'Rita Requestor', date '2026-10-14'
from (values ('Anna'), ('Ben')) as v (f);

create temporary table ids as
select first_name, id, ticket_id from public.requests where first_name in ('Anna', 'Ben');
grant select on ids to authenticated;

insert into public.signature_assets (user_id, kind, source, typed_text) values
  ('user_rc_admin', 'initials', 'typed', 'AA'),
  ('user_rc_abe', 'initials', 'typed', 'AB');

-- Ada executes and signs both; Abe confirms Anna (closed), Ben stays waiting.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_rc_admin","role":"authenticated"}', true);
select public.transition_request(id, 'in_execution') from ids;
insert into public.execution_confirmations (request_id, executed_by, checks)
select id, 'user_rc_admin',
  '{"access_provisioned": true, "devices_enrolled": true, "security_controls": true}' from ids;
select public.sign_request(id, public.request_snapshot_preview(id)) from ids;
reset role;
create temporary table reviewed as
select first_name, private.request_snapshot_data(id) as data from ids;
grant select on reviewed to authenticated;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_rc_abe","role":"authenticated"}', true);
select public.confirm_request(id, (select data from reviewed where first_name = 'Anna'))
from ids where first_name = 'Anna';

-- ---------------------------------------------------------------------------
-- Company timezone (D3)
-- ---------------------------------------------------------------------------
select is(private.company_timezone(), 'Asia/Dubai', 'the company timezone starts as Asia/Dubai');
select is((select company_timezone from public.app_settings), 'Asia/Dubai',
  'every active user can read the company settings');
select throws_ok($$select public.set_company_timezone('Europe/London')$$,
  '42501', 'only an admin changes the company timezone', 'an approver cannot change it');

select set_config('request.jwt.claims', '{"sub":"user_rc_admin","role":"authenticated"}', true);
select throws_ok($$select public.set_company_timezone('Mars/Olympus')$$,
  '23514', 'unknown timezone: Mars/Olympus', 'an unknown timezone is refused');
select throws_ok($$update public.app_settings set company_timezone = 'UTC'$$,
  '42501', null, 'settings are not changed directly, not even by an admin');
select lives_ok($$select public.set_company_timezone('Europe/London')$$, 'an admin changes it');
select is(private.company_timezone(), 'Europe/London', 'ticket years and dates follow the new timezone');
select public.set_company_timezone('Asia/Dubai');

-- ---------------------------------------------------------------------------
-- Storing and recording the PDF
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"user_rc_abe","role":"authenticated"}', true);
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner_id)
    select 'records', ticket_id || '/ben.test-onboarding.pdf', 'user_rc_abe' from ids where first_name = 'Ben'$$,
  '42501', null, 'no PDF can be stored for a request that is not approved');
select throws_ok(
  $$select public.record_pdf(id, 'ben.test-onboarding.pdf', repeat('b', 64), 1000) from ids where first_name = 'Ben'$$,
  '23514', 'a PDF exists only once the request is approved', 'no PDF record before approval (D18)');
select throws_ok(
  $$select public.record_pdf(id, 'anna.test-onboarding.pdf', repeat('a', 64), 1000) from ids where first_name = 'Anna'$$,
  '23514', 'upload the PDF first', 'the file must be stored before it is recorded');
select lives_ok(
  $$insert into storage.objects (bucket_id, name, owner_id)
    select 'records', ticket_id || '/anna.test-onboarding.pdf', 'user_rc_abe' from ids where first_name = 'Anna'$$,
  'the approver stores the PDF of a closed request');
select throws_ok(
  $$select public.record_pdf(id, 'anna.test-offboarding.pdf', repeat('a', 64), 1000) from ids where first_name = 'Anna'$$,
  '23514', 'the file name must end with -onboarding.pdf', 'the file name follows the request type (D18)');
select lives_ok(
  $$select public.record_pdf(id, 'anna.test-onboarding.pdf', repeat('a', 64), 1000) from ids where first_name = 'Anna'$$,
  'the stored PDF is recorded');
select ok(
  (select d.storage_path = i.ticket_id || '/anna.test-onboarding.pdf'
      and d.timezone = 'Asia/Dubai' and d.generated_by = 'user_rc_abe'
      and d.snapshot_id = (select snapshot_id from public.approvals
                           where request_id = i.id and decision = 'confirmed')
   from public.pdf_documents d join ids i on i.id = d.request_id),
  'the record points at the approval snapshot, the ticket folder and the company timezone');
select is(
  (select public.record_pdf(id, 'anna.other-onboarding.pdf', repeat('c', 64), 9) from ids where first_name = 'Anna'),
  (select id from public.pdf_documents),
  'one PDF per request: recording again returns the first one');
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner_id)
    select 'records', ticket_id || '/anna.second-onboarding.pdf', 'user_rc_abe' from ids where first_name = 'Anna'$$,
  '42501', null, 'once recorded, no second file can be stored');
select throws_ok($$update public.pdf_documents set sha256 = repeat('d', 64)$$,
  '42501', null, 'a record cannot be changed');

-- ---------------------------------------------------------------------------
-- Who sees and downloads it
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"user_rc_bea","role":"authenticated"}', true);
select isnt_empty($$select 1 from public.pdf_documents$$, 'every approver sees the record');
select isnt_empty($$select 1 from storage.objects where bucket_id = 'records'$$,
  'and may read the file');
select lives_ok($$select public.log_record_download(id) from ids where first_name = 'Anna'$$,
  'a download is logged');
select throws_ok($$select public.log_record_download(id) from ids where first_name = 'Ben'$$,
  'P0002', 'no PDF for this request', 'no download without a PDF');

select set_config('request.jwt.claims', '{"sub":"user_rc_admin","role":"authenticated"}', true);
select isnt_empty($$select 1 from public.pdf_documents$$, 'the admin sees the record');

select set_config('request.jwt.claims', '{"sub":"user_rc_ivan","role":"authenticated"}', true);
select is_empty($$select 1 from public.pdf_documents$$, 'an IT operator without an export role does not');
select is_empty($$select 1 from storage.objects where bucket_id = 'records'$$, 'nor the file');
select throws_ok($$select public.log_record_download(id) from ids where first_name = 'Anna'$$,
  '42501', 'only admins, approvers and auditors export records', 'nor downloads it');

-- The audit log (read as the owner).
reset role;
select ok(
  exists (select 1 from public.audit_events where action = 'settings.timezone_changed'
          and actor_id = 'user_rc_admin' and diff ->> 'after' = 'Europe/London'),
  'changing the timezone is audited');
select is(
  (select count(*)::int from public.audit_events
   where action in ('record.generated', 'record.downloaded') and entity_id = (select id::text from ids where first_name = 'Anna')),
  2, 'generating and downloading the PDF are audited');

select * from finish();
rollback;

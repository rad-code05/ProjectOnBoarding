-- Reports II (F13a): Onboarded by country / department (closed onboardings,
-- D16) and the Signature log (first Review & sign in the period; time to
-- approve from the first signature, returns included; names visible to
-- approvers too). Run: pnpm db:test
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

-- Fixtures (fake people only), inserted as the table owner.
insert into public.app_users (clerk_user_id, email, first_name, last_name) values
  ('user_r2_admin', 'r2-admin@example.test', 'Ada', 'Admin'),
  ('user_r2_abe',   'r2-abe@example.test',   'Abe', 'Approver'),
  ('user_r2_ivan',  'r2-ivan@example.test',  'Ivan', 'Operator');
insert into public.user_roles (clerk_user_id, role) values
  ('user_r2_admin', 'admin'), ('user_r2_admin', 'requester'), ('user_r2_admin', 'it_operator'),
  ('user_r2_abe', 'approver'),
  ('user_r2_ivan', 'it_operator');
insert into public.signature_assets (user_id, kind, source, typed_text) values
  ('user_r2_admin', 'initials', 'typed', 'AA'),
  ('user_r2_abe', 'initials', 'typed', 'AB');
insert into public.departments (name) values ('R2 Sales'), ('R2 Design');
create temporary table depts as select id, name from public.departments where name like 'R2 %';
grant select on depts to authenticated;

-- Closed onboardings with chosen dates (date-stamping triggers off for this
-- transaction only; rolled back at the end).
alter table public.requests disable trigger user;
insert into public.requests
  (ticket_id, ticket_year, ticket_number, type, state, created_by, first_name, last_name, work_email,
   department_id, country, form_version_id, created_at, closed_at)
select x.ticket, 2026, x.n, x.type::public.request_type, 'closed', 'user_r2_admin',
  'R2', x.first, x.first || '@r2.test',
  (select id from depts where name = x.dept), x.country,
  (select id from public.form_versions order by id limit 1), '2026-08-01Z', x.closed::timestamptz
from (values
  ('UAM-2026-910001', 910001, 'onboarding', 'a', 'R2 Sales',  'IS', '2026-08-10Z'),
  ('UAM-2026-910002', 910002, 'onboarding', 'b', 'R2 Sales',  'IS', '2026-08-11Z'),
  ('UAM-2026-910003', 910003, 'onboarding', 'c', 'R2 Design', 'IS', '2026-08-12Z'),
  ('UAM-2026-910004', 910004, 'onboarding', 'd', 'R2 Design', 'NO', '2026-08-13Z'),
  ('UAM-2026-910005', 910005, 'onboarding', 'e', null,        null, '2026-08-14Z'),
  ('UAM-2026-910006', 910006, 'offboarding', 'f', 'R2 Sales', 'IS', '2026-08-15Z'),
  ('UAM-2026-910007', 910007, 'onboarding', 'g', 'R2 Sales',  'IS', '2025-01-15Z')
) as x (ticket, n, type, first, dept, country, closed);
alter table public.requests enable trigger user;

-- Two requests through the real signing flow: Nina (signed, returned,
-- signed again, confirmed) and Dora (signed, still awaiting confirmation).
insert into public.requests
  (created_by, first_name, last_name, work_email, job_title, department_id, country,
   manager_name, requestor_name, effective_date)
values
  ('user_r2_admin', 'Nina', 'Log', 'nina.r2@example.test', 'Analyst', (select id from depts where name = 'R2 Sales'), 'IT',
   'Mara Manager', 'Rita Requestor', date '2026-01-05'),
  ('user_r2_admin', 'Dora', 'Log', 'dora.r2@example.test', 'Analyst', (select id from depts where name = 'R2 Sales'), 'IT',
   'Mara Manager', 'Rita Requestor', date '2026-01-05'),
  ('user_r2_admin', 'Sam', 'Draft', 'sam.r2@example.test', 'Analyst', (select id from depts where name = 'R2 Sales'), 'IT',
   'Mara Manager', 'Rita Requestor', date '2026-01-05');
create temporary table ids as
  select id, first_name, ticket_id from public.requests where work_email like '%.r2@example.test';
grant select on ids to authenticated;

-- Form v4.2 (F27): new requests need an Office before Review & sign.
update public.requests set office_id = (select id from public.offices where name = 'Dubai')
where office_id is null and state not in ('closed', 'cancelled');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_r2_admin","role":"authenticated"}', true);
select public.transition_request(id, 'in_execution') from ids where first_name in ('Nina', 'Dora');
insert into public.execution_confirmations (request_id, executed_by, checks)
select id, 'user_r2_admin', '{"access_provisioned": true, "devices_enrolled": true, "security_controls": true}'
from ids where first_name in ('Nina', 'Dora');
select public.sign_request(id, public.request_snapshot_preview(id)) from ids where first_name in ('Nina', 'Dora');
select set_config('request.jwt.claims', '{"sub":"user_r2_abe","role":"authenticated"}', true);
select public.return_request(id, 'Please check Slack.', '{5}') from ids where first_name = 'Nina';
select set_config('request.jwt.claims', '{"sub":"user_r2_admin","role":"authenticated"}', true);
select public.sign_request(id, public.request_snapshot_preview(id), 'Checked.') from ids where first_name = 'Nina';
reset role;
create temporary table snap as select private.request_snapshot_data(id) as data from ids where first_name = 'Nina';
grant select on snap to authenticated;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_r2_abe","role":"authenticated"}', true);
select public.confirm_request((select id from ids where first_name = 'Nina'), (select data from snap));

-- 1–3. Who may read --------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"user_r2_ivan","role":"authenticated"}', true);
select throws_ok($$select * from public.report_onboarded_by('country')$$, '42501', null,
  'an IT operator without admin is not a report reader');
select throws_ok($$select * from public.report_signature_log()$$, '42501', null, 'nor for the signature log');
select set_config('request.jwt.claims', '{"sub":"user_r2_admin","role":"authenticated"}', true);
select throws_ok($$select * from public.report_onboarded_by('team')$$, '23514', null, 'group is country or department');

-- 4–8. Onboarded by country / department --------------------------------------------
select is((select array_agg(row(key, onboarded)::text order by onboarded desc, key)
           from public.report_onboarded_by('country', '2026-08-01Z', '2026-09-01Z', p_department => (select id from depts where name = 'R2 Sales'))),
  array['(IS,2)'], 'closed onboardings of one department, per country (offboarding and older ones left out)');
select is((select array_agg(row(label, onboarded)::text order by onboarded desc, label)
           from public.report_onboarded_by('department', '2026-08-01Z', '2026-09-01Z', p_country => 'IS')),
  array['("R2 Sales",2)', '("R2 Design",1)'],
  'per department, with names, biggest first');
select is((select onboarded from public.report_onboarded_by('country', '2026-08-14Z', '2026-08-15Z') where key is null),
  1, 'a request without a country is its own group');
select is((select array_agg(onboarded) from public.report_onboarded_by('country', '2026-08-01Z', '2026-09-01Z', 'NO')),
  array[1], 'filter by country');
select is((select coalesce(sum(onboarded), 0)::int from public.report_onboarded_by('country', '2026-01-01Z', '2026-02-01Z')),
  0, 'no onboardings closed in the period = no rows');

-- 9–14. Signature log ---------------------------------------------------------------------
select is((select array_agg(ticket_id order by ticket_id)
           from public.report_signature_log(now() - interval '1 hour', p_search => 'r2@example')),
  (select array_agg(ticket_id order by ticket_id) from ids where first_name in ('Nina', 'Dora')),
  'every request IT signed in the period; the unsigned draft is not listed');
select is((select row(returns, approved_by, first_signed_by, state::text,
                      approved_at is not null, pdf_generated_at is null,
                      first_signed_at <= last_signed_at, it_sha256 is not null, final_sha256 is not null)::text
           from public.report_signature_log(p_search => 'nina.r2')),
  row(1, 'Abe Approver', 'Ada Admin', 'closed', true, true, true, true, true)::text,
  'Nina: one return, approver and IT signer by name, both fingerprints (no PDF made in this test)');
select is((select row(returns, approved_at is null, approved_by is null, state::text)::text
           from public.report_signature_log(p_search => 'dora.r2')),
  row(0, true, true, 'pending_confirmation')::text, 'Dora: signed, not approved yet');
select is((select row(total_count, approved_count, returned_count)::text
           from public.report_signature_log(p_search => 'r2@example', p_limit => 1)),
  row(2, 1, 1)::text, 'tiles: 2 signed, 1 approved, 1 returned at least once');
select ok((select median_seconds >= 0 from public.report_signature_log(p_search => 'r2@example', p_limit => 1)),
  'the median time to approve is computed over approved requests');
select is((select count(*)::int from public.report_signature_log(now() + interval '1 day', p_search => 'r2@example')),
  0, 'signed before the period = not listed');

-- 15–16. Approvers read the log, names included ----------------------------------------------
select set_config('request.jwt.claims', '{"sub":"user_r2_abe","role":"authenticated"}', true);
select is((select first_signed_by from public.report_signature_log(p_search => 'nina.r2')),
  'Ada Admin', 'an approver sees who signed, although they cannot read the people list');
select is((select count(*)::int from public.report_signature_log(p_search => 'r2@example')),
  2, 'an approver sees the awaiting and the closed request');

select * from finish();
rollback;

-- Reports I (F12a): who may read reports, the All users list (period,
-- filters, cancelled left out, approvers never see drafts), Onboarded by
-- month (D16: closed by the approver, company timezone, zero months listed)
-- and audited exports. Run: pnpm db:test
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

-- Fixtures (fake people only), inserted as the table owner.
insert into public.app_users (clerk_user_id, email, first_name, last_name) values
  ('user_rp_admin',   'rp-admin@example.test',   'Ada', 'Admin'),
  ('user_rp_abe',     'rp-abe@example.test',     'Abe', 'Approver'),
  ('user_rp_audrey',  'rp-audrey@example.test',  'Audrey', 'Auditor'),
  ('user_rp_ivan',    'rp-ivan@example.test',    'Ivan', 'Operator');
insert into public.user_roles (clerk_user_id, role) values
  ('user_rp_admin', 'admin'), ('user_rp_admin', 'requester'), ('user_rp_admin', 'it_operator'),
  ('user_rp_abe', 'approver'),
  ('user_rp_audrey', 'auditor'),
  ('user_rp_ivan', 'it_operator');
insert into public.departments (name) values ('Report Test Dept');
create temporary table dept as select id from public.departments where name = 'Report Test Dept';
grant select on dept to authenticated;

-- Requests with chosen dates: the triggers that stamp server times are
-- switched off for this transaction only (rolled back at the end).
alter table public.requests disable trigger user;
insert into public.requests
  (ticket_id, ticket_year, ticket_number, type, state, created_by, first_name, last_name, work_email,
   department_id, country, form_version_id, created_at, closed_at)
select x.ticket, 2026, x.n, x.type::public.request_type, x.state::public.request_state, 'user_rp_admin',
  x.first, 'Report', x.email, (select id from dept), x.country,
  (select id from public.form_versions order by id limit 1), x.created::timestamptz, x.closed::timestamptz
from (values
  -- closed onboardings: August, 31 Aug 21:00 UTC = 1 Sep in Dubai, September
  ('UAM-2026-900001', 900001, 'onboarding', 'closed', 'Olga', 'olga@rep.test', 'IS', '2026-08-01 08:00Z', '2026-08-10 10:00Z'),
  ('UAM-2026-900002', 900002, 'onboarding', 'closed', 'Pia',  'pia@rep.test',  'IS', '2026-08-20 08:00Z', '2026-08-31 21:00Z'),
  ('UAM-2026-900003', 900003, 'onboarding', 'closed', 'Quin', 'quin@rep.test', 'NO', '2026-09-01 08:00Z', '2026-09-05 09:00Z'),
  -- not onboarded: an offboarding closed in August, an onboarding still in execution
  ('UAM-2026-900004', 900004, 'offboarding', 'closed', 'Olga', 'olga@rep.test', 'IS', '2026-08-25 08:00Z', '2026-08-26 09:00Z'),
  ('UAM-2026-900005', 900005, 'onboarding', 'in_execution', 'Rex', 'rex@rep.test', 'IS', '2026-09-10 08:00Z', null),
  -- a draft (never for approvers) and a cancelled request (never in reports)
  ('UAM-2026-900006', 900006, 'onboarding', 'draft', 'Sam', 'sam@rep.test', 'IS', '2026-09-12 08:00Z', null),
  ('UAM-2026-900007', 900007, 'onboarding', 'cancelled', 'Tia', 'tia@rep.test', 'IS', '2026-09-13 08:00Z', null),
  -- created before the period
  ('UAM-2025-900008', 900008, 'onboarding', 'closed', 'Uma', 'uma@rep.test', 'IS', '2025-03-01 08:00Z', '2025-03-05 09:00Z')
) as x (ticket, n, type, state, first, email, country, created, closed);
alter table public.requests enable trigger user;

-- 1–3. Who may read reports ------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_rp_ivan","role":"authenticated"}', true);
select throws_ok($$select * from public.report_all_users()$$, '42501', null,
  'an IT operator without admin is not a report reader');
select throws_ok($$select * from public.report_onboarded_by_month('2026-07-01', '2026-09-01')$$, '42501', null,
  'nor for Onboarded by month');
select throws_ok($$select public.log_report_export('all_users', 'csv')$$, '42501', null,
  'nor may they log an export');

-- 4–11. All users list, as the admin ------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"user_rp_admin","role":"authenticated"}', true);
select is((select array_agg(ticket_id order by created_at desc)
           from public.report_all_users(p_from => '2026-01-01Z', p_search => 'rep.test', p_limit => 100)),
  array['UAM-2026-900006', 'UAM-2026-900005', 'UAM-2026-900003', 'UAM-2026-900004', 'UAM-2026-900002', 'UAM-2026-900001'],
  'requests created in the period, newest first, the cancelled one left out');
select is((select row(total_count, people_count)::text
           from public.report_all_users(p_from => '2026-01-01Z', p_search => 'rep.test', p_limit => 1)),
  row(6, 5)::text, 'the total counts requests and people (Olga has two requests)');
select is((select array_agg(ticket_id order by created_at desc)
           from public.report_all_users(p_from => '2026-01-01Z', p_search => 'rep.test', p_limit => 2, p_offset => 2)),
  array['UAM-2026-900003', 'UAM-2026-900004'], 'pages: limit and offset');
select is((select count(*)::int from public.report_all_users(p_search => 'rep.test', p_limit => 100)), 7,
  'no period = every request (still no cancelled)');
select is((select array_agg(ticket_id) from public.report_all_users(p_search => 'rep.test', p_type => 'offboarding')),
  array['UAM-2026-900004'], 'filter by type');
select is((select array_agg(ticket_id) from public.report_all_users(p_search => 'rep.test', p_country => 'NO')),
  array['UAM-2026-900003'], 'filter by country');
select is((select count(*)::int from public.report_all_users(p_department => (select id from dept), p_limit => 100)), 7,
  'filter by department');
select is((select row(department, country, state::text)::text
           from public.report_all_users(p_search => 'UAM-2026-900003')),
  row('Report Test Dept', 'NO', 'closed')::text, 'search by ticket; department by name');

-- 12–13. Approvers see what they see everywhere; auditors see all -------------------
select set_config('request.jwt.claims', '{"sub":"user_rp_abe","role":"authenticated"}', true);
select is((select array_agg(ticket_id order by created_at desc)
           from public.report_all_users(p_from => '2026-01-01Z', p_search => 'rep.test', p_limit => 100)),
  array['UAM-2026-900003', 'UAM-2026-900004', 'UAM-2026-900002', 'UAM-2026-900001'],
  'an approver never sees drafts or work in progress in reports');
select set_config('request.jwt.claims', '{"sub":"user_rp_audrey","role":"authenticated"}', true);
select is((select count(*)::int from public.report_all_users(p_from => '2026-01-01Z', p_search => 'rep.test', p_limit => 100)), 6,
  'an auditor sees every request');

-- 14–17. Onboarded by month (D16) ----------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"user_rp_abe","role":"authenticated"}', true);
select is((select array_agg(row(to_char(month, 'YYYY-MM'), onboarded)::text order by month)
           from public.report_onboarded_by_month('2026-07-15', '2026-09-30', p_department => (select id from dept))),
  array['(2026-07,0)', '(2026-08,1)', '(2026-09,2)'],
  'closed onboardings per month in Dubai time; 31 Aug 21:00 UTC counts in September; empty months listed');
select is((select array_agg(onboarded order by month)
           from public.report_onboarded_by_month('2026-08-01', '2026-09-01', p_country => 'IS', p_department => (select id from dept))),
  array[1, 1], 'filter by country');
select throws_ok($$select * from public.report_onboarded_by_month('2026-09-01', '2026-08-01')$$, '23514', null,
  'the first month must not be after the last');
select throws_ok($$select * from public.report_onboarded_by_month('2010-01-01', '2026-08-01')$$, '23514', null,
  'at most ten years at a time');

-- 18–20. Exports are audited -----------------------------------------------------------
select public.log_report_export('onboarded_by_month', 'pdf', '{"from":"2026-07","to":"2026-09","country":null}', 3);
reset role; -- approvers can't read the audit log; check it as the owner
select is((select row(entity, entity_id, diff ->> 'format', diff ->> 'rows', diff -> 'filters', private.audit_group(action))::text
           from public.audit_events where action = 'report.exported' and actor_id = 'user_rp_abe'),
  row('report', 'onboarded_by_month', 'pdf', '3', '{"to": "2026-09", "from": "2026-07"}'::jsonb, 'records')::text,
  'an approver''s export is recorded with format, rows and filters, under Records & PDFs');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_rp_abe","role":"authenticated"}', true);
select throws_ok($$select public.log_report_export('all_users', 'xlsx')$$, '23514', null, 'only CSV or PDF');
select throws_ok($$select public.log_report_export('Robert''); drop table x;--', 'csv')$$, '23514', null,
  'report names are plain words');

select * from finish();
rollback;

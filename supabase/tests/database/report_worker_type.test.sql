-- Employee or contractor in the reports (F24f-4a): every report with the place
-- filters takes p_worker_type; All users, Access holders and Employees ·
-- people return worker_type; a contractor with no office is "Office not set"
-- (office 0). Run: pnpm db:test
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

insert into public.app_users (clerk_user_id, email, first_name, last_name) values
  ('user_wt_admin', 'wt-admin@example.test', 'Ada', 'Admin');
insert into public.user_roles (clerk_user_id, role) values ('user_wt_admin', 'admin');
insert into public.departments (name) values ('WT Ops');

create temporary table v as select
  (select id from public.departments where name = 'WT Ops') as dept,
  (select id from public.offices where name = 'Dubai') as dubai,
  (select id from public.offices where name = 'US') as us;
grant select on v to authenticated;

-- Closed onboardings: two employees, two contractors (one with no office).
insert into public.employees (work_email, first_name, last_name)
select x.email, x.first, 'WT' from (values
  ('a.wt@example.test', 'Ann'), ('b.wt@example.test', 'Ben'),
  ('c.wt@example.test', 'Cai'), ('d.wt@example.test', 'Dee')) as x (email, first);
alter table public.requests disable trigger user;
insert into public.requests
  (ticket_id, ticket_year, ticket_number, type, state, created_by, employee_id, first_name, last_name,
   work_email, department_id, country, office_id, worker_type,
   form_version_id, created_at, closed_at)
select x.ticket, 2026, x.n, 'onboarding', 'closed', 'user_wt_admin',
  (select id from public.employees where work_email = x.email), x.first, 'WT', x.email,
  (select dept from v), x.country, x.office, x.kind,
  (select id from public.form_versions where version = '4.3'), now() - interval '3 days', now() - interval '2 days'
from (values
  ('UAM-2026-950001', 950001, 'a.wt@example.test', 'Ann', 'AE', (select dubai from v), 'employee'),
  ('UAM-2026-950002', 950002, 'b.wt@example.test', 'Ben', 'US', (select us from v), 'contractor'),
  ('UAM-2026-950003', 950003, 'c.wt@example.test', 'Cai', 'US', (select us from v), 'employee'),
  ('UAM-2026-950004', 950004, 'd.wt@example.test', 'Dee', 'DE', null::smallint, 'contractor')
) as x (ticket, n, email, first, country, office, kind);
alter table public.requests enable trigger user;
insert into public.employee_access_inventory (employee_id, kind, app_id, name, permission, granted_request_id, granted_at)
select e.id, 'application', a.id, a.name, 'Regular Member',
  (select id from public.requests where employee_id = e.id), now() - interval '2 days'
from public.employees e, public.catalog_apps a
where e.work_email like '%.wt@example.test' and a.name = 'Slack';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_wt_admin","role":"authenticated"}', true);

-- 1–4. All users list --------------------------------------------------------------------------------
select is((select array_agg(first_name order by first_name)
           from public.report_all_users(p_department => (select dept from v), p_worker_type => 'contractor')),
  array['Ben', 'Dee'], 'All users: contractors');
select is((select array_agg(first_name order by first_name)
           from public.report_all_users(p_department => (select dept from v), p_worker_type => 'employee')),
  array['Ann', 'Cai'], 'All users: employees');
select is((select array_agg(first_name || ':' || worker_type order by first_name)
           from public.report_all_users(p_department => (select dept from v))),
  array['Ann:employee', 'Ben:contractor', 'Cai:employee', 'Dee:contractor'], 'All users returns worker_type');
select is((select array_agg(first_name order by first_name)
           from public.report_all_users(p_department => (select dept from v), p_worker_type => 'contractor',
                                        p_office => 0::smallint)),
  array['Dee'], 'a contractor with no office = Office not set');

-- 5–6. Onboarded by month / by office ---------------------------------------------------------------
select is((select sum(onboarded)::integer
           from public.report_onboarded_by_month(current_date - 60, current_date,
                                                 p_department => (select dept from v), p_worker_type => 'contractor')),
  2, 'Onboarded by month: contractors');
select is((select array_agg(coalesce(label, 'not set') || '=' || onboarded order by label nulls last)
           from public.report_onboarded_by('office', p_department => (select dept from v),
                                           p_worker_type => 'contractor')),
  array['US=1', 'not set=1'], 'Onboarded by office: contractors, one with no office');

-- 7–9. Signature log and Offboarding SLA take the filter --------------------------------------------
select is((select count(*)::integer
           from public.report_signature_log(p_department => (select dept from v), p_worker_type => 'employee')),
  0, 'Signature log takes the filter (nothing signed here)');
select is((select count(*)::integer
           from public.report_offboarding_sla(p_department => (select dept from v), p_worker_type => 'contractor')),
  0, 'Offboarding SLA takes the filter');
select is((select count(*)::integer
           from public.report_offboarding_sla_summary(p_department => (select dept from v), p_worker_type => 'contractor')),
  0, 'Offboarding SLA summary takes the filter');

-- 10–11. Access by application ----------------------------------------------------------------------
select is((select holders
           from public.report_access_by_item('application', p_department => (select dept from v),
                                             p_worker_type => 'contractor')
           where name = 'Slack'),
  2, 'Access by application: contractors holding Slack');
select is((select array_agg(first_name || ':' || worker_type order by first_name)
           from public.report_access_holders('application', p_department => (select dept from v),
                                             p_worker_type => 'employee')),
  array['Ann:employee', 'Cai:employee'], 'Access holders: employees, with worker_type');

-- 12–13. Employees by office ------------------------------------------------------------------------
select is((select sum(employees)::integer
           from public.report_employees_by_office(p_department => (select dept from v), p_worker_type => 'contractor')),
  2, 'Employees by office: contractors');
select is((select array_agg(first_name || ':' || worker_type || ':' || coalesce(office, 'none') order by first_name)
           from public.report_employees(p_department => (select dept from v), p_worker_type => 'contractor')),
  array['Ben:contractor:US', 'Dee:contractor:none'], 'Employees · people: contractors, with worker_type');

-- 14. Custom reports' holdings still work -----------------------------------------------------------
select ok((select count(*) from public.report_access_held()
           where employee_id in (select id from public.employees where work_email like '%.wt@example.test')) = 4,
  'report_access_held calls the new access_held_rows');

-- 15. No filter = everyone -------------------------------------------------------------------------
select is((select count(*)::integer from public.report_all_users(p_department => (select dept from v))),
  4, 'no worker type filter = everyone');

select * from finish();
rollback;

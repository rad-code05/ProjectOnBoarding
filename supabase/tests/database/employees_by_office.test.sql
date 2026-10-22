-- Employees by office (F27e-1): employed today = a closed onboarding and no
-- offboarding closed since (a re-hire counts again); placed by the latest
-- closed request; an open offboarding = Leaving (only the ones the reader
-- may see); the report filters; report readers only. Run: pnpm db:test
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into public.app_users (clerk_user_id, email, first_name, last_name) values
  ('user_eo_admin', 'eo-admin@example.test', 'Ada', 'Admin'),
  ('user_eo_approver', 'eo-approver@example.test', 'Moe', 'Approver'),
  ('user_eo_requester', 'eo-requester@example.test', 'Rex', 'Requester');
insert into public.user_roles (clerk_user_id, role) values
  ('user_eo_admin', 'admin'), ('user_eo_approver', 'approver'), ('user_eo_requester', 'requester');
insert into public.departments (name) values ('EO Ops');
insert into public.office_cities (office_id, region_id, name)
select o.id, r.id, 'EO Austin' from public.offices o, public.country_regions r
where o.name = 'US' and r.country = 'US' and r.code = 'TX';

create temporary table v as select
  (select id from public.departments where name = 'EO Ops') as dept,
  (select id from public.offices where name = 'Dubai') as dubai,
  (select id from public.offices where name = 'Geneva') as geneva,
  (select id from public.offices where name = 'US') as us,
  (select id from public.country_regions where country = 'US' and code = 'TX') as tx,
  (select id from public.office_cities where name = 'EO Austin') as austin,
  (select id from public.form_versions where version = '4.2') as form;
grant select on v to authenticated;

insert into public.employees (work_email, first_name, last_name)
select lower(x.first) || '.eo@example.test', x.first, 'EO'
from (values ('Ann'), ('Ben'), ('Cai'), ('Dee'), ('Eve'), ('Fay'), ('Gus')) as x (first);

-- Requests with chosen states and times (triggers off; rolled back at the end).
alter table public.requests disable trigger user;
insert into public.requests
  (ticket_id, ticket_year, ticket_number, type, state, created_by, employee_id, first_name, last_name,
   work_email, department_id, country, office_id, region_id, office_city_id, nationalities,
   form_version_id, created_at, closed_at)
select 'UAM-2026-' || x.n, 2026, x.n, x.type::public.request_type, x.state::public.request_state, 'user_eo_admin',
  (select id from public.employees where first_name = x.first and last_name = 'EO'), x.first, 'EO',
  lower(x.first) || '.eo@example.test', (select dept from v), x.country, x.office, x.region, x.city, x.nat,
  (select form from v), now() - make_interval(days => x.days + 1),
  case when x.state = 'closed' then now() - make_interval(days => x.days) end
from (values
  -- Ann: onboarded in Dubai.
  (950001, 'Ann', 'onboarding', 'closed', 30, 'AE', (select dubai from v), null::smallint, null::integer, array['CH', 'IT']),
  -- Ben: onboarded in the US (Texas · Austin), offboarding in execution = Leaving.
  (950002, 'Ben', 'onboarding', 'closed', 30, 'US', (select us from v), (select tx from v), (select austin from v), array['US']),
  (950003, 'Ben', 'offboarding', 'in_execution', 1, 'US', (select us from v), (select tx from v), (select austin from v), array['US']),
  -- Cai: onboarded, then offboarded = gone.
  (950004, 'Cai', 'onboarding', 'closed', 30, 'AE', (select dubai from v), null, null, null),
  (950005, 'Cai', 'offboarding', 'closed', 5, 'AE', (select dubai from v), null, null, null),
  -- Dee: onboarded before the office field = office not set.
  (950006, 'Dee', 'onboarding', 'closed', 30, 'CH', null, null, null, null),
  -- Eve: only a draft onboarding = not employed.
  (950007, 'Eve', 'onboarding', 'draft', 2, 'AE', (select dubai from v), null, null, null),
  -- Fay: onboarded in Dubai, an access change moved her to Geneva.
  (950008, 'Fay', 'onboarding', 'closed', 30, 'AE', (select dubai from v), null, null, null),
  (950009, 'Fay', 'access_modification', 'closed', 3, 'CH', (select geneva from v), null, null, array['FR']),
  -- Gus: left, then re-hired in Dubai.
  (950010, 'Gus', 'onboarding', 'closed', 60, 'AE', (select dubai from v), null, null, null),
  (950011, 'Gus', 'offboarding', 'closed', 40, 'AE', (select dubai from v), null, null, null),
  (950012, 'Gus', 'onboarding', 'closed', 10, 'AE', (select dubai from v), null, null, null)
) as x (n, first, type, state, days, country, office, region, city, nat);
alter table public.requests enable trigger user;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_eo_admin","role":"authenticated"}', true);

-- 1–3. Who counts ------------------------------------------------------------------------------------
select is((select array_agg(first_name order by first_name)
           from public.report_employees(p_department => (select dept from v))),
  array['Ann', 'Ben', 'Dee', 'Fay', 'Gus'],
  'employed today: closed onboarding, no offboarding closed since; a re-hire counts; drafts do not');
select is((select row(office, country, nationalities)::text
           from public.report_employees(p_department => (select dept from v), p_search => 'fay.eo')),
  row('Geneva', 'CH', array['FR'])::text, 'placed by the latest closed request (the access change)');
select is((select array_agg(row(first_name, leaving_ticket_id)::text order by first_name)
           from public.report_employees(p_department => (select dept from v)) where leaving_request_id is not null),
  array['(Ben,UAM-2026-950003)'], 'an open offboarding = Leaving, with its ticket');

-- 4–5. Per office · state · city ------------------------------------------------------------------------
select is((select array_agg(row(office, region, city, employees, leaving)::text)
           from public.report_employees_by_office(p_department => (select dept from v))),
  array['(Dubai,,,2,0)', '(Geneva,,,1,0)', '(US,Texas,"EO Austin",1,1)', '(,,,1,0)'],
  'one row per office · state · city in office order, office not set last');
select is((select total_count from public.report_employees(p_department => (select dept from v)) limit 1),
  5::bigint, 'the list has the total');

-- 6–9. Filters ------------------------------------------------------------------------------------------------
select is((select array_agg(first_name order by first_name)
           from public.report_employees(p_department => (select dept from v), p_office => (select us from v),
                                        p_region => (select tx from v), p_city => (select austin from v))),
  array['Ben'], 'by office, state and city');
select is((select array_agg(first_name order by first_name)
           from public.report_employees(p_department => (select dept from v), p_office => 0::smallint)),
  array['Dee'], 'office not set');
select is((select array_agg(first_name order by first_name)
           from public.report_employees(p_department => (select dept from v), p_nationality => 'IT')),
  array['Ann'], 'by nationality (either of two)');
select is((select sum(employees)::int
           from public.report_employees_by_office(p_department => (select dept from v), p_country => 'AE')),
  2, 'by country (works in)');

-- 10. Paging --------------------------------------------------------------------------------------------------
select is((select array_agg(first_name)
           from public.report_employees(p_department => (select dept from v), p_limit => 2, p_offset => 1)),
  array['Gus', 'Fay'], 'pages in office order, then by name');

-- 11. Approvers: RLS decides — an offboarding still in execution is not Leaving for them --------------------
select set_config('request.jwt.claims', '{"sub":"user_eo_approver","role":"authenticated"}', true);
select is((select array_agg(row(office, employees, leaving)::text)
           from public.report_employees_by_office(p_department => (select dept from v), p_office => (select us from v))),
  array['(US,1,0)'], 'approver: Ben counts, not marked Leaving (the offboarding is not visible to them yet)');

-- 12. Report readers only --------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"user_eo_requester","role":"authenticated"}', true);
select throws_ok($$select * from public.report_employees_by_office()$$, '42501', null,
  'a requester is not a report reader');

select * from finish();
rollback;

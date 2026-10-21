-- Report filters by office, US state, city and nationality (F27d-1): one rule
-- for every report (office 0 / nationality 'none' = not set; either of two
-- nationalities matches), All users returns office / location /
-- nationalities, Onboarded by office, Access by application filters on the
-- latest closed request and names the office. Run: pnpm db:test
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

insert into public.app_users (clerk_user_id, email, first_name, last_name) values
  ('user_pf_admin', 'pf-admin@example.test', 'Ada', 'Admin');
insert into public.user_roles (clerk_user_id, role) values ('user_pf_admin', 'admin');
insert into public.departments (name) values ('PF Ops');
insert into public.office_cities (office_id, region_id, name)
select o.id, r.id, 'PF Austin' from public.offices o, public.country_regions r
where o.name = 'US' and r.country = 'US' and r.code = 'TX';

create temporary table v as select
  (select id from public.departments where name = 'PF Ops') as dept,
  (select id from public.offices where name = 'Dubai') as dubai,
  (select id from public.offices where name = 'US') as us,
  (select id from public.country_regions where country = 'US' and code = 'TX') as tx,
  (select id from public.office_cities where name = 'PF Austin') as austin;
grant select on v to authenticated;

-- Closed onboardings with chosen places (triggers off; rolled back at the end).
insert into public.employees (work_email, first_name, last_name)
select x.email, x.first, 'PF' from (values
  ('a.pf@example.test', 'Ann'), ('b.pf@example.test', 'Ben'),
  ('c.pf@example.test', 'Cai'), ('d.pf@example.test', 'Dee')) as x (email, first);
alter table public.requests disable trigger user;
insert into public.requests
  (ticket_id, ticket_year, ticket_number, type, state, created_by, employee_id, first_name, last_name,
   work_email, department_id, country, office_id, region_id, office_city_id, nationalities,
   form_version_id, created_at, closed_at)
select x.ticket, 2026, x.n, 'onboarding', 'closed', 'user_pf_admin',
  (select id from public.employees where work_email = x.email), x.first, 'PF', x.email,
  (select dept from v), x.country, x.office, x.region, x.city, x.nat,
  (select id from public.form_versions where version = '4.2'), now() - interval '3 days', now() - interval '2 days'
from (values
  ('UAM-2026-940001', 940001, 'a.pf@example.test', 'Ann', 'AE', (select dubai from v), null::smallint, null::integer, array['CH', 'IT']),
  ('UAM-2026-940002', 940002, 'b.pf@example.test', 'Ben', 'US', (select us from v), (select tx from v), (select austin from v), array['US']),
  ('UAM-2026-940003', 940003, 'c.pf@example.test', 'Cai', 'US', (select us from v), (select tx from v), null::integer, null::text[]),
  ('UAM-2026-940004', 940004, 'd.pf@example.test', 'Dee', 'CH', null::smallint, null::smallint, null::integer, null::text[])
) as x (ticket, n, email, first, country, office, region, city, nat);
alter table public.requests enable trigger user;
-- Something each of them holds (for Access by application).
insert into public.employee_access_inventory (employee_id, kind, app_id, name, permission, granted_request_id, granted_at)
select e.id, 'application', a.id, a.name, 'Regular Member',
  (select id from public.requests where employee_id = e.id), now() - interval '2 days'
from public.employees e, public.catalog_apps a
where e.work_email like '%.pf@example.test' and a.name = 'Slack';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_pf_admin","role":"authenticated"}', true);

-- 1–4. The rule ---------------------------------------------------------------------------------------
select ok(private.request_place_matches(1::smallint, null, null, array['CH', 'IT'], null, null, null, 'IT'),
  'either of two nationalities matches');
select ok(private.request_place_matches(null, null, null, null, 0::smallint, null, null, 'none'),
  'office 0 and nationality none = not set');
select ok(not private.request_place_matches(2::smallint, null, null, null, 0::smallint, null, null, null),
  'an office is not "not set"');
select ok(private.request_place_matches(4::smallint, 44::smallint, 7, null, null, null, null, null),
  'no filters = everything');

-- 5–9. All users list ------------------------------------------------------------------------------------
select is((select array_agg(first_name order by first_name)
           from public.report_all_users(p_department => (select dept from v), p_office => (select us from v))),
  array['Ben', 'Cai'], 'by office');
select is((select array_agg(first_name order by first_name)
           from public.report_all_users(p_department => (select dept from v), p_office => (select us from v),
                                        p_region => (select tx from v), p_city => (select austin from v))),
  array['Ben'], 'by state and city');
select is((select array_agg(first_name order by first_name)
           from public.report_all_users(p_department => (select dept from v), p_nationality => 'IT')),
  array['Ann'], 'by nationality (the second of two)');
select is((select array_agg(first_name order by first_name)
           from public.report_all_users(p_department => (select dept from v), p_office => 0::smallint)),
  array['Dee'], 'office not set');
select is((select row(office, location, nationalities)::text
           from public.report_all_users(p_search => 'b.pf@example')),
  row('US', 'Texas · PF Austin', array['US'])::text, 'the list names office, location and nationalities');

-- 10–12. Onboarded by office / month / country -----------------------------------------------------------------
select is((select array_agg(row(label, onboarded)::text order by onboarded desc, label nulls last)
           from public.report_onboarded_by('office', p_department => (select dept from v))),
  array['(US,2)', '(Dubai,1)', '(,1)'], 'Onboarded by office (not set is its own group)');
select is((select sum(onboarded)::int from public.report_onboarded_by_month(
             current_date - 30, current_date, p_department => (select dept from v), p_nationality => 'CH')),
  1, 'by month, one nationality');
select throws_ok($$select * from public.report_onboarded_by('city')$$, '23514', null,
  'group is country, department or office');

-- 13–14. Signature log / SLA take the filters ----------------------------------------------------------------
select is((select count(*)::int from public.report_signature_log(p_office => (select dubai from v), p_search => 'pf@example')),
  0, 'the signature log takes the office filter (nothing signed here)');
select is((select count(*)::int from public.report_offboarding_sla(p_office => (select us from v), p_search => 'pf@example')),
  0, 'the SLA report takes it too');

-- 15–16. Access by application -----------------------------------------------------------------------------------
select is((select holders from public.report_access_by_item('application', (select dept from v), p_office => (select us from v))
           where name = 'Slack'),
  2, 'people per app, by office (latest closed request)');
select is((select array_agg(row(first_name, office)::text order by first_name)
           from public.report_access_holders('application', (select 'app:' || id from public.catalog_apps where name = 'Slack'),
             (select dept from v), p_nationality => 'none')),
  array['(Cai,US)', '(Dee,)'], 'holders name the office; nationality not set');

select * from finish();
rollback;

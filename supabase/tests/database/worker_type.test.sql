-- Employee or contractor (F24f-1): the column, form v4.3 (not current yet),
-- Office required for an employee only, the snapshot, the copy into an access
-- change ("Was: Contractor"), the assistant's allowed fields, the staff import
-- and the department Legal. Run: pnpm db:test
begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

insert into public.app_users (clerk_user_id, email, first_name, last_name) values
  ('user_wt_admin', 'wt-admin@example.test', 'Ada', 'Admin');
insert into public.user_roles (clerk_user_id, role) values
  ('user_wt_admin', 'admin'), ('user_wt_admin', 'requester'), ('user_wt_admin', 'it_operator');

create temporary table t (key text primary key, id uuid);
grant all on t to authenticated;
create temporary table v as select
  (select id from public.form_versions where version = '4.3') as v43,
  (select id from public.offices where name = 'Dubai') as dubai;
grant select on v to authenticated;

-- 1–5. Reference data and form v4.3 ---------------------------------------------------------
select ok(exists (select 1 from public.departments where name = 'Legal' and active), 'department Legal');
select is((select array_agg(r.code || ' · ' || c.name order by c.name) from public.office_cities c
           join public.offices o on o.id = c.office_id and o.name = 'US'
           join public.country_regions r on r.id = c.region_id
           where c.name in ('Manlius', 'Rancho Mission Viejo', 'South Easton')),
  array['NY · Manlius', 'CA · Rancho Mission Viejo', 'MA · South Easton'],
  'three more cities of the US office for the import (20261106140000_us_cities_more.sql)');
select is((select is_current from public.form_versions where version = '4.3'), false,
  'form v4.3 exists but is not current yet (F24f-2 publishes it)');
select is((select key from public.form_fields where form_version_id = (select v43 from v) and section = 2
           order by sort_order limit 1), 'worker_type', 'Employee or contractor comes first in section 2');
select is((select row(required, field_type, options, applies_to)::text from public.form_fields
           where form_version_id = (select v43 from v) and key = 'worker_type'),
  row(true, 'worker_type', '["employee", "contractor"]'::jsonb,
      array['onboarding', 'offboarding', 'access_modification']::public.request_type[])::text,
  'required on every request type, two values');
select is((select count(*) from public.form_fields where form_version_id = (select v43 from v)),
  (select count(*) + 1 from public.form_fields f join public.form_versions x on x.id = f.form_version_id
   where x.version = '4.2'), 'v4.3 = every v4.2 field + the new one');

-- 6–11. The rules on a v4.3 request -----------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_wt_admin","role":"authenticated"}', true);
insert into public.requests (created_by, first_name, last_name, work_email, form_version_id)
values ('user_wt_admin', 'Sam', 'Okafor', 'sam.wt@example.test', (select v43 from v));
insert into t select 'sam', id from public.requests where work_email = 'sam.wt@example.test';

select throws_ok($$update public.requests set worker_type = 'intern' where id = (select id from t where key = 'sam')$$,
  '23514', null, 'only employee or contractor');
select ok((select (public.signing_checks((select id from t where key = 'sam')) -> 'missing_fields')
           ?& array['Employee or contractor', 'Office']),
  'nothing chosen: both Employee or contractor and Office are missing');
update public.requests set worker_type = 'employee' where id = (select id from t where key = 'sam');
select ok((select (public.signing_checks((select id from t where key = 'sam')) -> 'missing_fields') ? 'Office'),
  'an employee needs an office');
update public.requests set worker_type = 'contractor', country = 'ES' where id = (select id from t where key = 'sam');
select ok((select not ((public.signing_checks((select id from t where key = 'sam')) -> 'missing_fields')
                      ?| array['Office', 'Employee or contractor'])),
  'a contractor may have no office');
select lives_ok($$update public.requests set office_id = (select dubai from v) where id = (select id from t where key = 'sam')$$,
  'a contractor may still have an office');
select is((select audit.d -> 'changes' -> 'worker_type' ->> 'after' from (
           select diff as d from public.audit_events where action = 'request.updated'
             and entity_id = (select id::text from t where key = 'sam') and diff -> 'changes' ? 'worker_type'
           order by created_at desc, id desc limit 1) audit),
  'contractor', 'the change is audited like any field');

-- 12–13. Snapshot (internal function: read as the owner) ----------------------------------------
reset role;
select is(private.request_snapshot_data((select id from t where key = 'sam')) -> 'request' ->> 'worker_type',
  'contractor', 'the snapshot carries it');
insert into public.requests (created_by, first_name, work_email) values ('user_wt_admin', 'Old', 'old.wt@example.test');
select ok((select not ((private.request_snapshot_data(r.id) -> 'request') ? 'worker_type')
           from public.requests r where r.work_email = 'old.wt@example.test'),
  'not set → not in the snapshot (signed requests stay confirmable)');

-- 14–16. Access change: copied, and "Was: Contractor" ---------------------------------------------
insert into public.employees (work_email, first_name, last_name) values ('kim.wt@example.test', 'Kim', 'Ng');
alter table public.requests disable trigger user;
insert into public.requests
  (ticket_id, ticket_year, ticket_number, type, state, created_by, employee_id, first_name, last_name,
   work_email, country, worker_type, form_version_id, closed_at)
values ('UAM-2026-940001', 2026, 940001, 'onboarding', 'closed', 'user_wt_admin',
  (select id from public.employees where work_email = 'kim.wt@example.test'), 'Kim', 'Ng',
  'kim.wt@example.test', 'IT', 'contractor', (select v43 from v), now() - interval '1 day');
alter table public.requests enable trigger user;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_wt_admin","role":"authenticated"}', true);
insert into t select 'kim_change',
  public.create_access_modification((select id from public.employees where work_email = 'kim.wt@example.test'));
select is((select worker_type from public.requests where id = (select id from t where key = 'kim_change')),
  'contractor', 'an access change starts from what they were');
select lives_ok($$update public.requests set worker_type = 'employee', office_id = (select dubai from v)
  where id = (select id from t where key = 'kim_change')$$, 'a contractor becomes an employee');
reset role;
select is(private.request_snapshot_data((select id from t where key = 'kim_change'))
          -> 'access_modification' -> 'previous' ->> 'worker_type',
  'contractor', 'the access change shows what it was ("Was: Contractor")');

-- 17. The assistant may suggest it -------------------------------------------------------------
select ok(private.suggestion_field_ok('worker_type'), 'worker_type is a field the assistant may suggest');

-- 18–20. Staff import: contractor without office in, employee without office refused --------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_wt_admin","role":"authenticated"}', true);
with x as (insert into public.staff_imports (file_name) values ('wt.xlsx') returning id)
insert into t select 'import', id from x;
insert into public.staff_import_rows (import_id, position, person) values
  ((select id from t where key = 'import'), 1, jsonb_build_object(
    'first_name', 'Ana', 'last_name', 'Ruiz', 'work_email', 'ana.wt@example.test',
    'country', 'ES', 'worker_type', 'contractor', 'start_date', '2025-11-17'));
select lives_ok($$select public.import_staff((select id from t where key = 'import'))$$,
  'a contractor without an office is imported');
select is((select row(worker_type, office_id is null, country)::text from public.requests
           where work_email = 'ana.wt@example.test'),
  row('contractor', true, 'ES')::text, 'as a contractor with no office');

with x as (insert into public.staff_imports (file_name) values ('wt2.xlsx') returning id)
insert into t select 'import2', id from x;
insert into public.staff_import_rows (import_id, position, person) values
  ((select id from t where key = 'import2'), 1, jsonb_build_object(
    'first_name', 'Bo', 'last_name', 'Lund', 'work_email', 'bo.wt@example.test',
    'country', 'SE', 'start_date', '2025-11-17'));
select throws_matching($$select public.import_staff((select id from t where key = 'import2'))$$,
  'an employee needs an office', 'an employee (the default) without an office is refused');

select * from finish();
rollback;

-- Offices & nationality (F27a): seeds, admin functions + audit, the rules on a
-- request's office / state / city / nationalities, form v4.2 (not current
-- yet), required Office, the snapshot (new keys only when filled) and the
-- pre-fill of offboarding / access change. Run: pnpm db:test
begin;
create extension if not exists pgtap with schema extensions;
select plan(38);

-- Fixtures (fake people only), inserted as the table owner.
insert into public.app_users (clerk_user_id, email, first_name, last_name) values
  ('user_of_admin', 'of-admin@example.test', 'Ada', 'Admin'),
  ('user_of_abe',   'of-abe@example.test',   'Abe', 'Approver');
insert into public.user_roles (clerk_user_id, role) values
  ('user_of_admin', 'admin'), ('user_of_admin', 'requester'), ('user_of_admin', 'it_operator'),
  ('user_of_abe', 'approver');

create temporary table ids (label text primary key, id uuid);
grant select, insert on ids to authenticated;
create temporary table v as select
  (select id from public.offices where name = 'Dubai') as dubai,
  (select id from public.offices where name = 'US') as us,
  (select id from public.country_regions where country = 'US' and code = 'TX') as tx,
  (select id from public.country_regions where country = 'US' and code = 'CA') as ca,
  (select id from public.form_versions where version = '4.2') as v42;
grant select on v to authenticated;

-- 1–5. Seeds and form v4.2 ---------------------------------------------------------------------
select is((select array_agg(name order by sort_order) from public.offices),
  array['Dubai', 'Abu Dhabi', 'Geneva', 'US'], 'four offices to start');
select is((select array_agg(name order by name) from public.offices where uses_regions),
  array['US'], 'only the US asks for a state');
select is((select count(*)::int from public.country_regions where country = 'US'), 51, '50 states + DC');
select is((select row(f.is_current, (select is_current from public.form_versions where version = '4.1'))::text
           from public.form_versions f where f.version = '4.2'),
  row(true, false)::text, 'form v4.2 is current (published in F27c); 4.1 stays for older requests');
select is((select array_agg(key || ':' || required order by sort_order) from public.form_fields
           where form_version_id = (select v42 from v) and key in ('office', 'region', 'office_city', 'nationalities')),
  array['office:true', 'region:false', 'office_city:false', 'nationalities:false'],
  'v4.2 adds Office (required), State, City, Nationality to the v4.1 fields');

-- 6–15. Admin functions ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_of_abe","role":"authenticated"}', true);
select throws_ok($$select public.admin_save_office(null, 'Riyadh', 'Riyadh', 'SA', false)$$,
  '42501', null, 'only an admin adds offices');
select ok((select count(*) = 4 from public.offices), 'an approver reads the offices');

select set_config('request.jwt.claims', '{"sub":"user_of_admin","role":"authenticated"}', true);
insert into ids select 'riyadh', null;
select lives_ok($$select public.admin_save_office(null, '  Riyadh ', 'Riyadh', 'sa', false)$$,
  'an admin adds an office (name trimmed, country upper-cased)');
select is((select row(city, country, uses_regions, active)::text from public.offices where name = 'Riyadh'),
  row('Riyadh', 'SA', false, true)::text, 'saved as typed, cleaned');
select throws_ok($$select public.admin_save_office(null, 'riyadh', null, 'SA', false)$$,
  '23505', null, 'names are unique ignoring case');
select throws_ok($$select public.admin_save_office(null, 'Jeddah', null, 'SA', true)$$,
  '23514', null, 'states only where the country has them');
select lives_ok($$select public.admin_save_office((select id from public.offices where name = 'Riyadh'), 'Riyadh HQ', 'Riyadh', 'SA', false)$$,
  'rename an office');
select lives_ok($$select public.admin_set_office_active((select id from public.offices where name = 'Riyadh HQ'), false)$$,
  'retire an office');
select is((select array_agg(action order by created_at, id) from public.audit_events
           where action like 'office.%' and entity_id = (select id::text from public.offices where name = 'Riyadh HQ')),
  array['office.added', 'office.changed', 'office.retired'], 'every change audited');
select is((select private.audit_group('office.added')), 'admin', 'office changes belong to Admin in the audit log');

-- 16–20. Cities -------------------------------------------------------------------------------------
select lives_ok($$select public.admin_save_office_city(null, (select us from v), (select tx from v), 'Ofton')$$,
  'add Ofton to US · Texas');
select lives_ok($$select public.admin_save_office_city(null, (select us from v), (select tx from v), 'Ofville')$$,
  'add Ofville to US · Texas');
select throws_ok($$select public.admin_save_office_city(null, (select us from v), (select tx from v), 'austin')$$,
  '23505', null, 'a city once per office and state');
select throws_ok($$select public.admin_save_office_city(null, (select dubai from v), (select tx from v), 'Ofton')$$,
  '23514', null, 'no cities for an office without states');
select is((select action from public.audit_events where action = 'office.city_added' order by created_at desc, id desc limit 1),
  'office.city_added', 'cities audited');

-- 21–29. A request's office, state, city and nationalities -------------------------------------------
insert into public.requests (created_by, first_name, last_name, work_email, form_version_id)
values ('user_of_admin', 'Lena', 'Fischer', 'lena.of@example.test', (select v42 from v));
insert into ids select 'lena', id from public.requests where work_email = 'lena.of@example.test';
select ok((select (public.signing_checks((select id from ids where label = 'lena')) -> 'missing_fields') ? 'Office'),
  'on form v4.2 an empty Office blocks Review & sign');

select lives_ok($$update public.requests set office_id = (select us from v), region_id = (select tx from v),
    office_city_id = (select id from public.office_cities where name = 'Ofton'), country = 'US'
  where id = (select id from ids where label = 'lena')$$, 'US · Texas · Ofton');
select ok((select not ((public.signing_checks((select id from ids where label = 'lena')) -> 'missing_fields') ? 'Office')),
  'Office filled → no longer missing');
select throws_ok($$update public.requests set office_city_id = (select id from public.office_cities where name = 'Ofton'),
    region_id = (select ca from v) where id = (select id from ids where label = 'lena')$$,
  '23514', null, 'a city must belong to the chosen state');
select throws_ok($$update public.requests set office_id = (select dubai from v), office_city_id = null
  where id = (select id from ids where label = 'lena')$$,
  '23514', null, 'no state on an office without states');
select throws_ok($$update public.requests set office_id = (select id from public.offices where name = 'Riyadh HQ'),
    region_id = null, office_city_id = null where id = (select id from ids where label = 'lena')$$,
  '23514', null, 'a retired office cannot be chosen');
select lives_ok($$update public.requests set nationalities = array['CH', 'IT'] where id = (select id from ids where label = 'lena')$$,
  'two nationalities');
select throws_ok($$update public.requests set nationalities = array['CH', 'CH'] where id = (select id from ids where label = 'lena')$$,
  '23514', null, 'not the same one twice');
select throws_ok($$update public.requests set nationalities = array['CH', 'IT', 'FR'] where id = (select id from ids where label = 'lena')$$,
  '23514', null, 'at most two');

-- 30–32. Snapshot (internal function: read as the owner) ---------------------------------------------
reset role;
select is((select private.request_snapshot_data((select id from ids where label = 'lena')) -> 'request'
           -> 'office')::text, '"US"', 'the snapshot names the office');
select is((select (d -> 'region')::text || (d -> 'office_city')::text || (d -> 'nationalities')::text
           from (select private.request_snapshot_data((select id from ids where label = 'lena')) -> 'request' as d) s),
  '"Texas""Ofton"["CH", "IT"]', 'state, city and nationalities too');
insert into public.requests (created_by, first_name, work_email)
values ('user_of_admin', 'Old', 'old.of@example.test');
select ok((select not ((private.request_snapshot_data(r.id) -> 'request') ?| array['office', 'region', 'office_city', 'nationalities'])
           from public.requests r where r.work_email = 'old.of@example.test'),
  'a request without them has the same snapshot keys as before (signed requests stay confirmable)');

-- 33–38. Pre-fill from the last closed request --------------------------------------------------------
reset role;
insert into public.employees (work_email, first_name, last_name) values
  ('mia.of@example.test', 'Mia', 'Rossi'), ('sam.of@example.test', 'Sam', 'Old');
alter table public.requests disable trigger user;
insert into public.requests
  (ticket_id, ticket_year, ticket_number, type, state, created_by, employee_id, first_name, last_name,
   work_email, country, office_id, region_id, office_city_id, nationalities, form_version_id, closed_at)
select x.ticket, 2026, x.n, 'onboarding', 'closed', 'user_of_admin',
  (select id from public.employees where work_email = x.email), x.first, 'Test', x.email, x.country,
  x.office, x.region, x.city, x.nat, (select v42 from v), now() - interval '1 day'
from (values
  ('UAM-2026-930001', 930001, 'mia.of@example.test', 'Mia', 'US', (select us from v), (select tx from v),
   (select id from public.office_cities where name = 'Ofville'), array['IT']),
  ('UAM-2026-930002', 930002, 'sam.of@example.test', 'Sam', 'SA', (select id from public.offices where name = 'Riyadh HQ'),
   null::smallint, null::integer, null::text[])
) as x (ticket, n, email, first, country, office, region, city, nat);
alter table public.requests enable trigger user;
update public.office_cities set active = false where name = 'Ofville';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_of_admin","role":"authenticated"}', true);
insert into ids select 'mia_off', public.create_offboarding((select id from public.employees where work_email = 'mia.of@example.test'));
insert into ids select 'sam_change', public.create_access_modification((select id from public.employees where work_email = 'sam.of@example.test'));
select is((select row(o.name, rg.name, r.office_city_id is null, r.nationalities)::text
           from public.requests r join public.offices o on o.id = r.office_id
           join public.country_regions rg on rg.id = r.region_id
           where r.id = (select id from ids where label = 'mia_off')),
  row('US', 'Texas', true, array['IT'])::text,
  'offboarding copies office, state and nationality; a retired city is left empty');
select is((select row(office_id is null, region_id is null, country)::text from public.requests
           where id = (select id from ids where label = 'sam_change')),
  row(true, true, 'SA')::text, 'a retired office is not copied (Raju chooses again)');
reset role;
select is((select private.request_snapshot_data((select id from ids where label = 'sam_change'))
           -> 'access_modification' -> 'previous' ->> 'office'),
  'Riyadh HQ', 'an access change shows the office it was ("Was: …")');

-- Retired items stay on requests that already have them.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_of_admin","role":"authenticated"}', true);
select lives_ok($$update public.requests set job_title = 'Analyst' where id = (select id from ids where label = 'mia_off')$$,
  'editing another field keeps the office');
select set_config('request.jwt.claims', '{"sub":"user_of_abe","role":"authenticated"}', true);
select throws_ok($$select public.admin_set_office_city_active((select id from public.office_cities where name = 'Ofton'), false)$$,
  '42501', null, 'only an admin retires a city');
reset role;
select ok((select not has_table_privilege('anon', 'public.offices', 'select')), 'nothing for anonymous visitors');

select * from finish();
rollback;

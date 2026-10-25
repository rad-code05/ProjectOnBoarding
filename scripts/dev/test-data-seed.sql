-- DEV ONLY — the standard test set (Raju, 2026-10-25): 26 fictional people
-- with every field filled, taken through the REAL workflow (the database
-- functions the app uses), as the e2e test accounts:
--   20 onboarded (closed: IT signed, approver confirmed — inventory filled),
--      2 of them leaving: an open offboarding whose SLA deadline has passed,
--    3 awaiting the approver's confirmation,
--    3 drafts.
-- No backdating: every time is the server's. The overdue SLAs come from an
-- access cut-off typed as two days ago (a typed field, like in the app).
-- Names are invented; emails use example.com (reserved, nobody's real
-- address). Run after test-data-clean.sql, as the database owner:
--   docker exec -i supabase_db_laine-onboarding psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q < scripts/dev/test-data-seed.sql
--   (`supabase db query --local` runs one statement only)
--   pnpm exec supabase db query --linked -f scripts/dev/test-data-seed.sql
-- NEVER on a production database.
begin;

do $$
begin
  if not exists (select 1 from public.app_users where email like 'e2e.%+clerk\_test@%') then
    raise exception 'no e2e test accounts here — refusing to seed what may be a production database';
  end if;
  if exists (select 1 from public.requests) then
    raise exception 'there are requests already — run test-data-clean.sql first';
  end if;
end;
$$;

-- The actors: the e2e admin signs as IT, the e2e approver confirms.
create temporary table actors as
select
  (select clerk_user_id from public.app_users where email like 'e2e.admin+clerk\_test@%') as it,
  (select clerk_user_id from public.app_users where email like 'e2e.approver+clerk\_test@%') as ap;

-- Both need a signature on file (a fresh local database has none).
insert into public.signature_assets (user_id, kind, source, typed_text, is_active)
select u, 'initials', 'typed', t, true
from actors, lateral (values (actors.it, 'EA'), (actors.ap, 'EP')) as v (u, t)
where not exists (select 1 from public.signature_assets s where s.user_id = v.u and s.is_active);

create temporary table people (
  first text, last text, office text, region text, city text, nat text[],
  dept text, title text, manager text, effective date,
  stage text, apps text[], laptop text, phone boolean, vpn boolean
);
insert into people values
-- Dubai
('Layla', 'Al Mansoori', 'Dubai', null, null, '{AE}', 'Sales', 'Account Executive', 'Hamad Al Suwaidi', '2026-10-05', 'closed', '{Slack:Regular Member,Google Workspace:User,Monday.com:Member,HubSpot:Core user,Zoom:Licensed}', 'Laptop · Windows', true, false),
('Omar', 'Haddad', 'Dubai', null, null, '{JO}', 'Operations', 'Operations Coordinator', 'Hamad Al Suwaidi', '2026-10-06', 'closed', '{Slack:Regular Member,Google Workspace:User,Monday.com:Member}', 'Laptop · Windows', false, false),
('Priya', 'Raman', 'Dubai', null, null, '{IN}', 'Engineering', 'Backend Engineer', 'Kiran Desai', '2026-10-07', 'closed', '{Slack:Regular Member,Google Workspace:User,GitHub:Maintain,Sentry:Member,Cursor:Member,Monday.com:Member}', 'Laptop · macOS', false, true),
('Arjun', 'Mehta', 'Dubai', null, null, '{IN}', 'Tech', 'DevOps Engineer', 'Kiran Desai', '2026-10-08', 'closed', '{Slack:Regular Member,Google Workspace:User,GitHub:Admin,Sentry:Manager}', 'Laptop · macOS', false, true),
('Rafiq', 'Ahmed', 'Dubai', null, null, '{BD}', 'Engineering', 'Frontend Engineer', 'Kiran Desai', '2026-10-12', 'closed', '{Slack:Regular Member,Google Workspace:User,GitHub:Maintain,Figma:Dev,Monday.com:Member}', 'Laptop · macOS', false, true),
('Nadia', 'Islam', 'Dubai', null, null, '{BD,GB}', 'Marketing', 'Content Lead', 'Sara Whitfield', '2026-10-14', 'closed', '{Slack:Regular Member,Google Workspace:User,Figma:View,HubSpot:Core user,Monday.com:Member}', 'Laptop · macOS', true, false),
('Maria', 'Santos', 'Dubai', null, null, '{PH}', 'Admin', 'Office Administrator', 'Hamad Al Suwaidi', '2026-10-15', 'closed', '{Slack:Regular Member,Office 365:User,Monday.com:Guest}', 'Laptop · Windows', true, false),
('Joseph', 'dela Cruz', 'Dubai', null, null, '{PH}', 'Operations', 'Logistics Officer', 'Hamad Al Suwaidi', '2026-10-16', 'leaving', '{Slack:Regular Member,Google Workspace:User,Monday.com:Member,Zoom:Basic}', 'Laptop · Windows', true, false),
-- Abu Dhabi
('Fatima', 'Al Hashimi', 'Abu Dhabi', null, null, '{AE}', 'Compliance', 'Compliance Analyst', 'Youssef Benali', '2026-10-05', 'closed', '{Slack:Regular Member,Google Workspace:User,Confluence:User,Monday.com:Member}', 'Laptop · Windows', false, true),
('Khalid', 'Al Nuaimi', 'Abu Dhabi', null, null, '{AE}', 'Sales', 'Sales Manager', 'Youssef Benali', '2026-10-09', 'closed', '{Slack:Regular Member,Google Workspace:User,HubSpot:Super Admin,Zoom:Admin,Monday.com:Admin}', 'Laptop · macOS', true, false),
('Sana', 'Qureshi', 'Abu Dhabi', null, null, '{PK}', 'Tech', 'IT Support Engineer', 'Youssef Benali', '2026-10-13', 'closed', '{Slack:Regular Member,Google Workspace:Super Admin,GitHub:Maintain,Office 365:Admin}', 'Laptop · Windows', false, true),
('Tamim', 'Hossain', 'Abu Dhabi', null, null, '{BD}', 'Operations', 'Data Analyst', 'Youssef Benali', '2026-10-20', 'closed', '{Slack:Regular Member,Google Workspace:User,Monday.com:Member,Trello:Member}', 'Laptop · Windows', false, false),
-- Geneva
('Lukas', 'Meier', 'Geneva', null, null, '{CH}', 'Engineering', 'Staff Engineer', 'Elena Fischer', '2026-10-05', 'closed', '{Slack:Regular Member,Google Workspace:User,GitHub:Admin,Sentry:Owner,Cursor:Admin}', 'Laptop · macOS', false, true),
('Chloé', 'Dubois', 'Geneva', null, null, '{CH,FR}', 'Marketing', 'Brand Designer', 'Elena Fischer', '2026-10-08', 'closed', '{Slack:Regular Member,Google Workspace:User,Figma:Full,Monday.com:Member,Zoom:Basic}', 'Laptop · macOS', false, false),
('Matteo', 'Rossi', 'Geneva', null, null, '{IT}', 'Sales', 'Partner Manager', 'Elena Fischer', '2026-10-10', 'closed', '{Slack:Regular Member,Google Workspace:User,HubSpot:Core user,Zoom:Licensed}', 'Laptop · macOS', true, false),
('Anna', 'Keller', 'Geneva', null, null, '{CH,DE}', 'Compliance', 'Head of Compliance', 'Elena Fischer', '2026-10-12', 'closed', '{Slack:Regular Member,Google Workspace:User,Confluence:Admin,Monday.com:Member}', 'Laptop · macOS', true, true),
('Jonas', 'Becker', 'Geneva', null, null, '{DE}', 'Tech', 'Security Engineer', 'Elena Fischer', '2026-10-14', 'leaving', '{Slack:Regular Member,Google Workspace:User,GitHub:Maintain,Sentry:Member}', 'Laptop · macOS', false, true),
-- US
('Emily', 'Carter', 'US', 'Texas', 'Austin', '{US}', 'Sales', 'Sales Development Rep', 'Michael Grant', '2026-10-06', 'closed', '{Slack:Regular Member,Google Workspace:User,HubSpot:Core user,Zoom:Licensed,Monday.com:Member}', 'Laptop · macOS', true, false),
('Daniel', 'Kim', 'US', 'California', 'San Francisco', '{US,KR}', 'Engineering', 'Machine Learning Engineer', 'Michael Grant', '2026-10-09', 'closed', '{Slack:Regular Member,Google Workspace:User,GitHub:Maintain,Cursor:Member,Sentry:Member}', 'Laptop · macOS', false, true),
('Lucas', 'Oliveira', 'US', 'Texas', 'Dallas', '{BR}', 'Marketing', 'Growth Marketer', 'Michael Grant', '2026-10-13', 'closed', '{Slack:Regular Member,Google Workspace:User,HubSpot:Core user,Figma:View,Monday.com:Member}', 'Laptop · Windows', true, false),
-- Awaiting the approver
('Aisha', 'Rahman', 'Dubai', null, null, '{BD}', 'Tech', 'Cloud Engineer', 'Kiran Desai', '2026-10-27', 'pending', '{Slack:Regular Member,Google Workspace:User,GitHub:Maintain,Monday.com:Member}', 'Laptop · macOS', false, true),
('Hiroshi', 'Tanaka', 'Geneva', null, null, '{JP}', 'Engineering', 'Data Engineer', 'Elena Fischer', '2026-10-28', 'pending', '{Slack:Regular Member,Google Workspace:User,GitHub:Maintain,Sentry:Member}', 'Laptop · macOS', false, true),
('Sofia', 'Martínez', 'US', 'Texas', 'Austin', '{ES}', 'Sales', 'Customer Success Manager', 'Michael Grant', '2026-10-29', 'pending', '{Slack:Regular Member,Google Workspace:User,HubSpot:Core user,Zoom:Licensed}', 'Laptop · Windows', true, false),
-- Drafts
('Ethan', 'Brooks', 'US', 'Texas', 'Dallas', '{US}', 'Operations', 'Operations Analyst', 'Michael Grant', '2026-11-03', 'draft', '{Slack:Regular Member,Google Workspace:User,Monday.com:Member}', 'Laptop · Windows', false, false),
('Zainab', 'Yusuf', 'Abu Dhabi', null, null, '{NG}', 'Marketing', 'Social Media Manager', 'Youssef Benali', '2026-11-04', 'draft', '{Slack:Regular Member,Google Workspace:User,Figma:View}', 'Laptop · macOS', true, false),
('Felix', 'Wagner', 'Geneva', null, null, '{AT}', 'Tech', 'Platform Engineer', 'Elena Fischer', '2026-11-05', 'draft', '{Slack:Regular Member,Google Workspace:User,GitHub:Maintain}', 'Laptop · macOS', false, true);

-- Work emails: first.last@example.com, accents and spaces removed.
alter table people add column email text;
update people set email = lower(
  translate(first, 'éÉáíóúñ', 'eEaioun') || '.' ||
  replace(translate(last, 'éÉáíóúñ', 'eEaioun'), ' ', '') || '@example.com');

grant select on actors, people to authenticated;

-- ---------------------------------------------------------------------------
-- 1. IT (e2e admin): every request with all its fields and items
-- ---------------------------------------------------------------------------
set local role authenticated;
select 'acting as the e2e IT operator' as step from (select set_config('request.jwt.claims',
  json_build_object('sub', (select it from actors), 'role', 'authenticated')::text, true)) s;

insert into public.requests
  (created_by, first_name, last_name, work_email, job_title, department_id, country,
   manager_name, requestor_name, effective_date, office_id, region_id, office_city_id, nationalities)
select a.it, p.first, p.last, p.email, p.title,
  (select id from public.departments d where d.name = p.dept),
  case p.office when 'Geneva' then 'CH' when 'US' then 'US' else 'AE' end,
  p.manager, 'Raju Bholani', p.effective,
  (select id from public.offices o where o.name = p.office),
  (select id from public.country_regions r where r.country = 'US' and r.name = p.region),
  (select c.id from public.office_cities c join public.country_regions r on r.id = c.region_id
   where r.name = p.region and c.name = p.city),
  p.nat
from people p, actors a;

create temporary table req on commit drop as
select p.*, r.id from people p join public.requests r on r.work_email = p.email;

insert into public.request_access_items (request_id, app_id, action, permission)
select q.id, a.id, 'Grant', split_part(x, ':', 2)
from req q, unnest(q.apps) as x
join public.catalog_apps a on a.name = split_part(x, ':', 1);

insert into public.request_equipment_items (request_id, type_id, action, asset_tag)
select q.id, t.id, 'Issue', 'LT-' || (1000 + row_number() over (order by q.email))
from req q join public.equipment_types t on t.name = q.laptop;
insert into public.request_equipment_items (request_id, type_id, action, asset_tag)
select q.id, t.id, 'Issue', 'PH-' || (500 + row_number() over (order by q.email))
from req q join public.equipment_types t on t.name = 'Mobile phone' where q.phone;

insert into public.request_physical_access_items (request_id, type_id, action, scope)
select q.id, t.id, 'Grant', case when q.office = 'US' then 'Key' else 'Badge' end
from req q join public.physical_access_types t on t.name = 'Office access';
insert into public.request_physical_access_items (request_id, type_id, action, scope)
select q.id, t.id, 'Grant', 'Corporate VPN'
from req q join public.physical_access_types t on t.name = 'VPN / secure access' where q.vpn;

-- Everyone but the drafts: IT does the work, ticks section 9, signs.
select public.transition_request(id, 'in_execution') from req where stage <> 'draft';
insert into public.execution_confirmations (request_id, executed_by, checks)
select q.id, a.it, '{"access_provisioned": true, "devices_enrolled": true, "security_controls": true}'
from req q, actors a where q.stage <> 'draft';
select public.sign_request(id, public.request_snapshot_preview(id)) from req where stage <> 'draft';

-- ---------------------------------------------------------------------------
-- 2. The approver (e2e approver) confirms, signs and closes the 20
-- ---------------------------------------------------------------------------
reset role;
create temporary table reviewed on commit drop as
select q.id, private.request_snapshot_data(q.id) as data
from req q where q.stage in ('closed', 'leaving');
grant select on reviewed to authenticated;
set local role authenticated;
select 'acting as the e2e approver' as step from (select set_config('request.jwt.claims',
  json_build_object('sub', (select ap from actors), 'role', 'authenticated')::text, true)) s;
select public.confirm_request(id, data) from reviewed;

-- ---------------------------------------------------------------------------
-- 3. Two of them are leaving: offboarding open, SLA deadline passed
-- ---------------------------------------------------------------------------
select 'acting as the e2e IT operator' as step from (select set_config('request.jwt.claims',
  json_build_object('sub', (select it from actors), 'role', 'authenticated')::text, true)) s;
reset role;
create temporary table leavers on commit drop as
select e.id as employee_id, q.email from req q join public.employees e on e.work_email = q.email
where q.stage = 'leaving';
grant select on leavers to authenticated;
set local role authenticated;
select public.create_offboarding(employee_id) from leavers;
update public.requests r
set sla_timeline = 'within_24h',
    access_cutoff_at = now() - interval '2 days',
    last_working_day = current_date - 2,
    handover_to = 'Hamad Al Suwaidi'
from leavers l
where r.type = 'offboarding' and r.work_email = l.email and r.state = 'draft';
select public.transition_request(r.id, 'in_execution')
from public.requests r join leavers l on l.email = r.work_email
where r.type = 'offboarding' and r.state = 'draft';

reset role;
select type, state, count(*) from public.requests group by 1, 2 order by 1, 2;
commit;

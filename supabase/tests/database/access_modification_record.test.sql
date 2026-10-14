-- Access modification on the signed record (F10a-2): the snapshot says what
-- each changed line HAD, freezes section 2 as it was and everything KEPT; an
-- access change needs at least one line; at closing the inventory follows,
-- ending exactly the returned device. Run: pnpm db:test
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

-- Fixtures (fake people only), inserted as the table owner.
insert into public.app_users (clerk_user_id, email, first_name, last_name) values
  ('user_ar_admin', 'ar-admin@example.test', 'Ada', 'Admin'),
  ('user_ar_abe',   'ar-abe@example.test',   'Abe', 'Approver');
insert into public.user_roles (clerk_user_id, role) values
  ('user_ar_admin', 'admin'), ('user_ar_admin', 'requester'), ('user_ar_admin', 'it_operator'),
  ('user_ar_abe', 'approver');
insert into public.signature_assets (user_id, kind, source, typed_text) values
  ('user_ar_admin', 'initials', 'typed', 'AA'),
  ('user_ar_abe', 'initials', 'typed', 'AB');

-- Closes a request the normal way: execution, Raju signs, Abe confirms.
create function pg_temp.close_request(p_id uuid) returns void language plpgsql as $$
declare
  v_data jsonb;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"user_ar_admin","role":"authenticated"}', true);
  if (select state from public.requests where id = p_id) = 'draft' then
    perform public.transition_request(p_id, 'in_execution');
  end if;
  insert into public.execution_confirmations (request_id, executed_by, checks)
  values (p_id, 'user_ar_admin', '{"access_provisioned": true, "devices_enrolled": true, "security_controls": true}')
  on conflict (request_id) do nothing;
  perform public.sign_request(p_id, public.request_snapshot_preview(p_id));
  reset role;
  v_data := private.request_snapshot_data(p_id);
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"user_ar_abe","role":"authenticated"}', true);
  perform public.confirm_request(p_id, v_data);
  reset role;
end;
$$;

-- Nina's onboarding: Slack, Figma, an "Other" app, two laptops (no asset tags), office access.
insert into public.requests
  (created_by, first_name, last_name, work_email, job_title, department_id, country,
   manager_name, requestor_name, effective_date)
values ('user_ar_admin', 'Nina', 'Test', 'nina.ar@example.test', 'Analyst',
  (select id from public.departments where name = 'Sales'), 'IT',
  'Mara Manager', 'Rita Requestor', date '2026-01-05');
create temporary table onb as select id from public.requests where work_email = 'nina.ar@example.test';
insert into public.request_access_items (request_id, app_id, action, permission)
select (select id from onb), a.id, x.action, x.permission
from (values ('Slack', 'Grant', 'Regular Member'), ('Figma', 'Grant', 'Dev')) as x (name, action, permission)
join public.catalog_apps a on a.name = x.name;
insert into public.request_access_items (request_id, app_name, action)
values ((select id from onb), 'Miro Board', 'Grant');
insert into public.request_equipment_items (request_id, type_id, action, description)
select (select id from onb), id, 'Issue', x.d
from public.equipment_types, (values ('first laptop'), ('second laptop')) as x (d)
where name = 'Laptop · macOS';
insert into public.request_physical_access_items (request_id, type_id, action, scope)
select (select id from onb), id, 'Grant', 'Badge' from public.physical_access_types where name = 'Office access';
select pg_temp.close_request((select id from onb));

create temporary table nina as select id from public.employees where work_email = 'nina.ar@example.test';
create temporary table held as
  select i.id, i.name, i.kind, i.description from public.employee_access_inventory i
  where i.employee_id = (select id from nina) and i.ended_at is null;
-- Both laptops were granted at the same moment: the one to return is the one
-- an "oldest first" guess would NOT pick.
create temporary table target as
  select id from held where kind = 'equipment' order by id desc limit 1;
grant select on nina, held, target to authenticated;

-- Raju's access change for Nina.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_ar_admin","role":"authenticated"}', true);
create temporary table chg as select public.create_access_modification((select id from nina)) as id;
reset role;
grant select on chg to authenticated;

select is(private.access_change_blockers((select id from chg)),
  array['At least one change: an application, device or access to change, remove or add'],
  'an access change with no line cannot be signed');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_ar_admin","role":"authenticated"}', true);
update public.requests set job_title = 'Lead', effective_date = date '2026-10-20' where id = (select id from chg);
insert into public.request_access_items (request_id, app_id, inventory_id, action, permission)
select (select id from chg), a.id, (select id from held where name = 'Slack'), 'Modify', 'Workspace Owner'
from public.catalog_apps a where a.name = 'Slack';
insert into public.request_access_items (request_id, app_id, inventory_id, action)
select (select id from chg), a.id, (select id from held where name = 'Figma'), 'Remove'
from public.catalog_apps a where a.name = 'Figma';
insert into public.request_access_items (request_id, app_id, action, permission)
select (select id from chg), a.id, 'Grant', 'Maintain' from public.catalog_apps a where a.name = 'GitHub';
insert into public.request_equipment_items (request_id, type_id, inventory_id, action)
select (select id from chg), t.id, (select id from target), 'Return'
from public.equipment_types t where t.name = 'Laptop · macOS';
reset role;

select is(private.access_change_blockers((select id from chg)), '{}'::text[],
  'with a line it can be signed');

-- ---------------------------------------------------------------------------
-- The snapshot
-- ---------------------------------------------------------------------------
create temporary table snap as select private.request_snapshot_data(id) as d from chg;
select is(
  (select e ->> 'had' from snap, jsonb_array_elements(d -> 'access') e where e ->> 'app' = 'Slack'),
  'Regular Member', 'a changed app says what she had (Slack: Regular Member)');
select is(
  (select e ->> 'permission' from snap, jsonb_array_elements(d -> 'access') e where e ->> 'app' = 'Slack'),
  'Workspace Owner', '… and what she gets (Workspace Owner)');
select ok(
  (select not (e ? 'had') from snap, jsonb_array_elements(d -> 'access') e where e ->> 'app' = 'GitHub'),
  'a new app has no "had"');
select is(
  (select d -> 'access_modification' -> 'previous' ->> 'job_title' from snap), 'Analyst',
  'section 2 as it was is frozen (job title Analyst → Lead)');
select is(
  (select array_agg(e ->> 'name' order by e ->> 'kind', e ->> 'name')
   from snap, jsonb_array_elements(d -> 'access_modification' -> 'kept') e),
  array['Office access', 'Miro Board', 'Laptop · macOS'],
  'kept: everything she holds that this request leaves alone (by kind)');
select is(
  (select e ->> 'description' from snap, jsonb_array_elements(d -> 'access_modification' -> 'kept') e
   where e ->> 'kind' = 'equipment'),
  (select description from held where kind = 'equipment' and id <> (select id from target)),
  'the laptop she keeps is the other one');
select ok(
  not (private.request_snapshot_data((select id from onb)) ? 'access_modification'),
  'an onboarding snapshot is unchanged (no access-change block)');

-- ---------------------------------------------------------------------------
-- Signed, confirmed, closed: the inventory follows
-- ---------------------------------------------------------------------------
select lives_ok($$select pg_temp.close_request((select id from chg))$$,
  'Raju signs and Abe confirms the access change');
select is((select state::text from public.requests where id = (select id from chg)), 'closed', 'it is closed');
select is(
  (select permission from public.employee_access_inventory
   where employee_id = (select id from nina) and name = 'Slack' and ended_at is null),
  'Workspace Owner', 'her Slack is now Workspace Owner');
select is(
  (select end_reason from public.employee_access_inventory where id = (select id from held where name = 'Slack')),
  'replaced', 'the old Slack row is ended as replaced');
select ok(
  (select ended_at is not null and end_reason = 'removed' from public.employee_access_inventory
   where id = (select id from held where name = 'Figma'))
  and exists (select 1 from public.employee_access_inventory
              where employee_id = (select id from nina) and name = 'GitHub' and permission = 'Maintain' and ended_at is null),
  'Figma is removed and GitHub is added');
select ok(
  (select ended_at is not null from public.employee_access_inventory where id = (select id from target))
  and (select ended_at is null from public.employee_access_inventory
       where kind = 'equipment' and employee_id = (select id from nina) and id <> (select id from target)),
  'exactly the returned laptop is ended; the other one is still held');
select is(
  (select count(*)::int from public.employee_access_inventory where employee_id = (select id from nina) and ended_at is null),
  5, 'she now holds Slack, GitHub, Miro Board, one laptop and office access');

select * from finish();
rollback;

-- Offboarding work (F09b-2): only closed rights are pre-filled; removal method
-- + tick (server time), equipment return, mailbox; SLA met / missed from the
-- ticks; Review & sign blockers; the snapshot; the inventory after closing.
-- Run: pnpm db:test   (needs the local database: pnpm db:start)
begin;
create extension if not exists pgtap with schema extensions;
select plan(34);

-- Fixtures (fake people only), inserted as the table owner.
insert into public.app_users (clerk_user_id, email, first_name, last_name) values
  ('user_ow_admin', 'ow-admin@example.test', 'Ada', 'Admin'),
  ('user_ow_abe',   'ow-abe@example.test',   'Abe', 'Approver');
insert into public.user_roles (clerk_user_id, role) values
  ('user_ow_admin', 'admin'), ('user_ow_admin', 'requester'), ('user_ow_admin', 'it_operator'),
  ('user_ow_abe', 'approver');
insert into public.signature_assets (user_id, kind, source, typed_text) values
  ('user_ow_admin', 'initials', 'typed', 'AA'),
  ('user_ow_abe', 'initials', 'typed', 'AB');

create temporary table r (label text primary key, id uuid);
grant select, insert on r to authenticated;

-- A: Nina's onboarding (closed) · B: Nina, cancelled · C: Nina, a draft · F: Max (closed)
insert into public.requests
  (created_by, first_name, last_name, work_email, job_title, department_id, country,
   manager_name, requestor_name, effective_date)
select 'user_ow_admin', split_part(x.email, '.', 1), 'Test', x.email, 'Analyst',
  (select id from public.departments where name = 'Sales'), 'IT', 'Mara Manager', 'Rita Requestor', date '2026-01-05'
from (values ('A', 'nina.ow@example.test'), ('B', 'nina.ow@example.test'),
             ('C', 'nina.ow@example.test'), ('F', 'max.ow@example.test')) as x (label, email);
insert into r
select x.label, q.id from (
  select id, row_number() over (order by ticket_number) as n from public.requests
  where work_email in ('nina.ow@example.test', 'max.ow@example.test')) q
join (values (1, 'A'), (2, 'B'), (3, 'C'), (4, 'F')) as x (n, label) using (n);

insert into public.request_access_items (request_id, app_id, action, permission)
select (select id from r where label = x.label), a.id, x.action, x.permission
from (values ('A', 'Slack', 'Grant', 'Regular Member'), ('A', 'Figma', 'Grant', 'Dev'),
             ('B', 'GitHub', 'Grant', 'Maintain'), ('C', 'Zoom', 'Grant', 'Basic'),
             ('F', 'GitHub', 'Grant', 'Admin')) as x (label, app, action, permission)
join public.catalog_apps a on a.name = x.app;
insert into public.request_equipment_items (request_id, type_id, action, asset_tag)
select (select id from r where label = 'A'), id, 'Issue', 'LT-1' from public.equipment_types where name = 'Laptop · macOS';
insert into public.request_physical_access_items (request_id, type_id, action, scope)
select (select id from r where label = 'A'), id, 'Grant', 'Badge' from public.physical_access_types where name = 'Office access';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_ow_admin","role":"authenticated"}', true);
select public.transition_request(id, 'in_execution') from r where label in ('A', 'F');
insert into public.execution_confirmations (request_id, executed_by, checks)
select id, 'user_ow_admin', '{"access_provisioned": true, "devices_enrolled": true, "security_controls": true}'
from r where label in ('A', 'F');
select public.sign_request(id, public.request_snapshot_preview(id)) from r where label in ('A', 'F');
select public.transition_request((select id from r where label = 'B'), 'cancelled', 'not needed');
reset role;
create temporary table reviewed as select label, private.request_snapshot_data(id) as data from r where label in ('A', 'F');
grant select on reviewed to authenticated;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_ow_abe","role":"authenticated"}', true);
select public.confirm_request(r.id, v.data) from r join reviewed v using (label);

-- Raju offboards Nina (N), Max (M) and someone not in the app (E).
select set_config('request.jwt.claims', '{"sub":"user_ow_admin","role":"authenticated"}', true);
insert into r select 'N', public.create_offboarding((select id from public.employees where work_email = 'nina.ow@example.test'));
insert into r select 'M', public.create_offboarding((select id from public.employees where work_email = 'max.ow@example.test'));
insert into r select 'E', public.create_offboarding(null);

-- ---------------------------------------------------------------------------
-- Only rights from closed requests are pre-filled (Raju's check, 2026-10-13)
-- ---------------------------------------------------------------------------
select is(
  (select string_agg(app_name || ':' || permission, ', ' order by app_name) from public.request_access_items
   where request_id = (select id from r where label = 'N')),
  'Figma:Dev, Slack:Regular Member',
  'Nina: only her closed request — not the cancelled GitHub, not the draft Zoom, not Max''s GitHub');
select is(
  (select string_agg(app_name || ':' || permission, ', ') from public.request_access_items
   where request_id = (select id from r where label = 'M')),
  'GitHub:Admin', 'Max: only his own rights');
select is((select return_status from public.request_equipment_items where request_id = (select id from r where label = 'N')),
  'pending', 'pre-filled equipment starts as Return pending');

-- SLA: Nina's deadline is still ahead (cut-off an hour ago, 24h); Max's passed days ago.
update public.requests
set sla_timeline = 'within_24h', access_cutoff_at = now() - interval '1 hour', last_working_day = current_date,
    effective_date = current_date
where id = (select id from r where label = 'N');
update public.requests
set sla_timeline = 'within_24h', access_cutoff_at = now() - interval '3 days', last_working_day = current_date - 3,
    effective_date = current_date - 3, handover_to = 'Mara Manager'
where id = (select id from r where label = 'M');

-- ---------------------------------------------------------------------------
-- Recording removals
-- ---------------------------------------------------------------------------
create temporary view n_app with (security_invoker = true) as
select a.* from public.request_access_items a where a.request_id = (select id from r where label = 'N');
grant select on n_app to authenticated;

select throws_ok(
  $$select public.set_removal('application', (select id from n_app where app_name = 'Slack'), true, 'Delete')$$,
  '23514', 'removals are recorded while the offboarding is in execution', 'not before execution starts');
select public.transition_request(id, 'in_execution') from r where label in ('N', 'M');

select set_config('request.jwt.claims', '{"sub":"user_ow_abe","role":"authenticated"}', true);
select throws_ok(
  $$select public.set_removal('application', (select a.id from public.request_access_items a
      join r on r.id = a.request_id where r.label = 'N' and a.app_name = 'Slack'), true, 'Delete')$$,
  '42501', 'only the IT side records offboarding work', 'an approver cannot tick removals');
select set_config('request.jwt.claims', '{"sub":"user_ow_admin","role":"authenticated"}', true);

select throws_ok($$update public.request_access_items set done_at = now() where id = (select id from n_app where app_name = 'Slack')$$,
  '42501', 'removal ticks, returns and the mailbox change only through their functions',
  'nobody types a tick time directly');
select throws_ok($$select public.set_removal('application', (select id from n_app where app_name = 'Slack'), true)$$,
  '23514', 'choose Delete, Suspend or Disable for Slack first', 'a tick needs the removal method');
select throws_ok($$select public.set_removal('application', (select id from n_app where app_name = 'Slack'), null, 'Burn')$$,
  '23514', 'choose Delete, Suspend or Disable', 'only Delete, Suspend or Disable');

select public.set_removal('application', (select id from n_app where app_name = 'Slack'), null, 'Delete');
select is((select coalesce(removal_method, '-') || ' · ' || (done_at is null)::text from n_app where app_name = 'Slack'),
  'Delete · true', 'choosing the method alone does not tick it');
select public.set_removal('application', (select id from n_app where app_name = 'Slack'), true);
select ok((select done_at is not null and done_by = 'user_ow_admin' from n_app where app_name = 'Slack'),
  'the tick records the time and who ticked');
select throws_ok($$select public.set_removal('application', (select id from n_app where app_name = 'Slack'), null, 'Suspend')$$,
  '23514', 'untick Slack before changing how it was removed', 'the method is fixed while ticked');
select public.set_removal('application', (select id from n_app where app_name = 'Slack'), false);
select ok((select done_at is null from n_app where app_name = 'Slack'), 'a tick can be taken back');
select ok(exists (select 1 from public.audit_events where action = 'request.removal_undone'
  and entity_id = (select id from r where label = 'N')::text), 'ticks and unticks are audited');

-- ---------------------------------------------------------------------------
-- Review & sign blockers
-- ---------------------------------------------------------------------------
select ok(
  (select (public.signing_checks((select id from r where label = 'N')) -> 'missing_fields')
    @> '["Removal method (Delete, Suspend or Disable) for 1 application(s)", "Applications removed (0 of 2)",
         "Access disabled or removed (0 of 1)",
         "Data & mailbox go to", "Mailbox: converted to a shared mailbox, or no mailbox to convert"]'::jsonb),
  'Review & sign lists everything still open');
select ok(
  (select (public.signing_checks((select id from r where label = 'E')) -> 'missing_fields')
    ? 'At least one application or access to remove'),
  'an offboarding needs at least one removal');

-- ---------------------------------------------------------------------------
-- Equipment and mailbox
-- ---------------------------------------------------------------------------
create temporary view n_kit with (security_invoker = true) as
select e.* from public.request_equipment_items e where e.request_id = (select id from r where label = 'N');
grant select on n_kit to authenticated;
select throws_ok($$select public.set_equipment_return((select id from n_kit), 'not_returned', '  ')$$,
  '23514', 'say why it was not returned', 'Not returned needs a reason');
select public.set_equipment_return((select id from n_kit), 'not_returned', 'Lost by the courier; wiped remotely');
select ok((select return_status = 'not_returned' and return_recorded_at is not null and return_recorded_by = 'user_ow_admin' from n_kit),
  'Not returned is recorded with its reason, time and person');
-- Back to pending: since 2026-10-13 a pending device doesn't block signing.
select public.set_equipment_return((select id from n_kit), 'pending');
select ok(
  not (select (public.signing_checks((select id from r where label = 'N')) -> 'missing_fields')::text
    like '%Equipment%'),
  'a device still Return pending is not a blocker');
select throws_ok($$select public.set_mailbox_handling((select id from r where label = 'N'), 'forwarded')$$,
  '23514', 'mailbox must be converted_shared or no_mailbox', 'only the two mailbox choices');
create temporary table v_before as select version from public.requests where id = (select id from r where label = 'N');
grant select on v_before to authenticated;
select public.set_mailbox_handling((select id from r where label = 'N'), 'converted_shared');
select is((select version from public.requests where id = (select id from r where label = 'N')),
  (select version from v_before), 'the mailbox choice keeps the version, so the open form can still save');
select ok((select mailbox_handling = 'converted_shared' and mailbox_recorded_at is not null
  from public.requests where id = (select id from r where label = 'N')), 'shared mailbox recorded with its time');

-- ---------------------------------------------------------------------------
-- Finishing Nina's offboarding in time
-- ---------------------------------------------------------------------------
select public.set_removal('application', (select id from n_app where app_name = 'Slack'), true, 'Delete');
select public.set_removal('application', (select id from n_app where app_name = 'Figma'), true, 'Suspend');
select public.set_removal('access', (select p.id from public.request_physical_access_items p
  where p.request_id = (select id from r where label = 'N')), true);
update public.requests set handover_to = 'Mara Manager' where id = (select id from r where label = 'N');
insert into public.execution_confirmations (request_id, executed_by, checks)
select id, 'user_ow_admin', '{"access_removed": true, "devices_recovered": true, "security_controls": true}'
from r where label in ('N', 'M');

select is((select public.request_sla((select id from r where label = 'N')) ->> 'met'), 'true',
  'every removal ticked before the deadline: SLA met');
select is((select (public.request_sla((select id from r where label = 'N')) ->> 'done') || ' of '
  || (public.request_sla((select id from r where label = 'N')) ->> 'total')), '3 of 3', 'applications and access count; equipment does not');
select is((select public.signing_checks((select id from r where label = 'N')) -> 'missing_fields'), '[]'::jsonb,
  'nothing left: Review & sign can go ahead');

select lives_ok($$select public.sign_request((select id from r where label = 'N'),
  public.request_snapshot_preview((select id from r where label = 'N')))$$, 'Raju signs the offboarding');
reset role;
select is(
  (select data -> 'offboarding' -> 'sla' ->> 'met' from public.request_snapshots
   where request_id = (select id from r where label = 'N') and kind = 'it_signature'),
  'true', 'the signed snapshot carries the SLA result');
select is(
  (select string_agg(x ->> 'app' || ':' || (x ->> 'removal_method'), ', ' order by x ->> 'app')
   from public.request_snapshots s, jsonb_array_elements(s.data -> 'access') x
   where s.request_id = (select id from r where label = 'N') and s.kind = 'it_signature'),
  'Figma:Suspend, Slack:Delete', 'and how each application was removed');
select ok(
  (select not (data ? 'offboarding') and not (data -> 'access' -> 0 ? 'removal_method')
   from public.request_snapshots where request_id = (select id from r where label = 'A') and kind = 'approval'),
  'onboarding snapshots are unchanged (no offboarding fields)');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_ow_admin","role":"authenticated"}', true);
select throws_ok($$select public.set_removal('application', (select id from n_app where app_name = 'Slack'), false)$$,
  '23514', 'removals are recorded while the offboarding is in execution', 'no unticking after Review & sign');
reset role;

create temporary table n_reviewed as select private.request_snapshot_data((select id from r where label = 'N')) as data;
grant select on n_reviewed to authenticated;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_ow_abe","role":"authenticated"}', true);
select public.confirm_request((select id from r where label = 'N'), (select data from n_reviewed));
reset role;
select is(
  (select string_agg(i.name, ', ') from public.employee_access_inventory i join public.employees e on e.id = i.employee_id
   where e.work_email = 'nina.ow@example.test' and i.ended_at is null),
  'Laptop · macOS',
  'once the offboarding closes, Nina holds only the laptop still Return pending');

-- ---------------------------------------------------------------------------
-- Max: the deadline passed → missed, reason required
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_ow_admin","role":"authenticated"}', true);
select public.set_removal('application', a.id, true, 'Delete')
from public.request_access_items a where a.request_id = (select id from r where label = 'M');
select public.set_mailbox_handling((select id from r where label = 'M'), 'no_mailbox');
select is((select public.request_sla((select id from r where label = 'M')) ->> 'met'), 'false',
  'removed after the deadline: SLA missed (worked out, not typed)');
select ok((select (public.signing_checks((select id from r where label = 'M')) -> 'missing_fields')
  ? 'Reason the access removal SLA was missed'), 'a missed SLA needs a reason before Review & sign');
update public.requests set sla_missed_reason = 'GitHub admin removal needed the org owner'
where id = (select id from r where label = 'M');
select is((select public.signing_checks((select id from r where label = 'M')) -> 'missing_fields'), '[]'::jsonb,
  'with the reason, Review & sign can go ahead');
select throws_ok($$update public.requests set sla_missed_reason = 'x' where id = (select id from r where label = 'C')$$,
  '23514', null, 'only offboardings have an SLA reason');
reset role;

select * from finish();
rollback;

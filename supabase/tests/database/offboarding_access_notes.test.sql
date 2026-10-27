-- Offboarding access: a tick or a note (Raju, 2026-10-27). Access the person
-- holds must be ticked or carry a note; access added by hand is optional;
-- a noted or optional row never makes the SLA "missed"; notes only while in
-- execution, audited.
-- Run: pnpm db:test
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into public.app_users (clerk_user_id, email, first_name, last_name) values
  ('user_an_admin', 'an-admin@example.test', 'Ada', 'Admin'),
  ('user_an_abe',   'an-abe@example.test',   'Abe', 'Approver');
insert into public.user_roles (clerk_user_id, role) values
  ('user_an_admin', 'admin'), ('user_an_admin', 'requester'), ('user_an_admin', 'it_operator'),
  ('user_an_abe', 'approver');
insert into public.signature_assets (user_id, kind, source, typed_text) values
  ('user_an_admin', 'initials', 'typed', 'AA'), ('user_an_abe', 'initials', 'typed', 'AB');

-- Lena's closed onboarding: Slack and an office badge.
insert into public.requests
  (created_by, first_name, last_name, work_email, job_title, department_id, country,
   manager_name, requestor_name, effective_date, office_id)
values ('user_an_admin', 'Lena', 'Test', 'lena.an@example.test', 'Analyst',
  (select id from public.departments where name = 'Sales'), 'AE', 'Mara Manager', 'Rita Requestor',
  date '2026-01-05', (select id from public.offices where name = 'Dubai'));
create temporary table onb as select id from public.requests where work_email = 'lena.an@example.test';
grant select on onb to authenticated;
insert into public.request_access_items (request_id, app_id, action, permission)
select (select id from onb), id, 'Grant', 'Regular Member' from public.catalog_apps where name = 'Slack';
insert into public.request_physical_access_items (request_id, type_id, action, scope)
select (select id from onb), id, 'Grant', 'Badge' from public.physical_access_types where name = 'Office access';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_an_admin","role":"authenticated"}', true);
select public.transition_request(id, 'in_execution') from onb;
insert into public.execution_confirmations (request_id, executed_by, checks)
select id, 'user_an_admin', '{"access_provisioned": true, "devices_enrolled": true, "security_controls": true}' from onb;
select public.sign_request(id, public.request_snapshot_preview(id)) from onb;
reset role;
create temporary table reviewed as select private.request_snapshot_data(id) as data from onb;
grant select on reviewed to authenticated;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_an_abe","role":"authenticated"}', true);
select public.confirm_request(id, (select data from reviewed)) from onb;

-- The offboarding: badge pre-filled (held); a VPN row added by hand (not held).
select set_config('request.jwt.claims', '{"sub":"user_an_admin","role":"authenticated"}', true);
create temporary table off (id uuid);
insert into off select public.create_offboarding(
  (select id from public.employees where work_email = 'lena.an@example.test'));
reset role;
insert into public.request_physical_access_items (request_id, type_id, action, scope)
select (select id from off), id, 'Disable', 'Corporate VPN' from public.physical_access_types where name = 'VPN / secure access';
update public.requests set sla_timeline = 'within_24h', access_cutoff_at = now() + interval '1 hour',
  last_working_day = current_date, effective_date = current_date, handover_to = 'Mara',
  office_id = (select id from public.offices where name = 'Dubai')
where id = (select id from off);
grant select on off to authenticated;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_an_admin","role":"authenticated"}', true);

-- 1. Notes wait for execution ----------------------------------------------------------------------
select throws_ok(format($$select public.set_access_note(%L, 'later')$$,
    (select pa.id from public.request_physical_access_items pa join public.physical_access_types t on t.id = pa.type_id
     where pa.request_id = (select id from off) and t.name = 'Office access')),
  '23514', null, 'a note is written while the offboarding is in execution');
select public.transition_request(id, 'in_execution') from off;
reset role;  -- the private checks below run as the owner

-- 2–3. Only the held badge counts --------------------------------------------------------------------
select ok('Access disabled or removed, or a note why not (0 of 1)' = any(private.offboarding_blockers((select id from off))),
  'the held badge must be ticked or noted — the hand-added VPN does not count');
select is((private.request_sla((select id from off)) ->> 'total')::int, 2,
  'the SLA counts Slack and the badge, not the optional VPN');

-- 4–7. A note instead of the tick ---------------------------------------------------------------------
set local role authenticated;
select lives_ok(format($$select public.set_access_note(%L, '  Badge collected Friday by HR  ')$$,
    (select pa.id from public.request_physical_access_items pa join public.physical_access_types t on t.id = pa.type_id
     where pa.request_id = (select id from off) and t.name = 'Office access')),
  'writing a note on the badge');
reset role;
select ok(not exists (select 1 from unnest(private.offboarding_blockers((select id from off))) b
                      where b like 'Access disabled%'),
  'a note satisfies the access line');
select is((private.request_sla((select id from off)) ->> 'total')::int, 1,
  'a noted badge no longer counts for the SLA');
select is((select diff ->> 'after' from public.audit_events
           where action = 'request.removal_note_set' and entity_id = (select id::text from off)),
  'Badge collected Friday by HR', 'the note is audited (trimmed)');

-- 8–9. Ticking still works, and the optional VPN never blocks ---------------------------------------
set local role authenticated;
select lives_ok(format($$select public.set_removal('access', %L, true)$$,
    (select pa.id from public.request_physical_access_items pa join public.physical_access_types t on t.id = pa.type_id
     where pa.request_id = (select id from off) and t.name = 'VPN / secure access')),
  'the optional VPN can still be ticked');
reset role;
select is((private.request_sla((select id from off)) ->> 'total')::int, 2,
  'once ticked it counts (it was done)');

select * from finish();
rollback;

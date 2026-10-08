-- Workflow states and section 9 (F04a). F04 done-when: invalid transitions
-- are rejected by the database.
-- Run: pnpm db:test   (needs the local database: pnpm db:start)
begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

-- Fixtures (fake people only), inserted as the table owner.
insert into public.app_users (clerk_user_id, email, first_name, last_name) values
  ('user_wf_admin',    'wf-admin@example.test',    'Ada', 'Admin'),
  ('user_wf_approver', 'wf-approver@example.test', 'Abe', 'Approver'),
  ('user_wf_both',     'wf-both@example.test',     'Bo',  'Both');
insert into public.user_roles (clerk_user_id, role) values
  ('user_wf_admin', 'admin'), ('user_wf_admin', 'requester'), ('user_wf_admin', 'it_operator'),
  ('user_wf_approver', 'approver'),
  -- Can create AND approve: must still never confirm their own request.
  ('user_wf_both', 'requester'), ('user_wf_both', 'approver');

insert into public.requests (created_by, first_name) values
  ('user_wf_admin', 'Dora'), ('user_wf_admin', 'Cara'), ('user_wf_both', 'Owen');
insert into public.requests (created_by, first_name, type) values ('user_wf_admin', 'Olaf', 'offboarding');

create temporary table ids as
select first_name, id from public.requests where first_name in ('Dora', 'Cara', 'Owen', 'Olaf');
grant select on ids to authenticated;

-- ---------------------------------------------------------------------------
-- Checklist items (data)
-- ---------------------------------------------------------------------------
select results_eq(
  $$select key from public.execution_checklist_items where 'onboarding' = any (applies_to) order by sort_order$$,
  array['access_provisioned', 'devices_enrolled', 'security_controls'],
  'onboarding has three checklist items');
select results_eq(
  $$select key from public.execution_checklist_items where 'offboarding' = any (applies_to) order by sort_order$$,
  array['access_removed', 'devices_recovered', 'security_controls'],
  'offboarding has its own checklist items');

-- ---------------------------------------------------------------------------
-- IT side
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_wf_admin","role":"authenticated"}', true);

select throws_ok(
  $$update public.requests set state = 'in_execution' where first_name = 'Dora'$$,
  '42501', null, 'a direct state change is still refused');
select throws_ok(
  $$update public.requests set execution_started_at = '2000-01-01' where first_name = 'Dora'$$,
  '42501', null, 'workflow timestamps cannot be written directly (never backdated)');
select throws_ok(
  $$select public.transition_request((select id from ids where first_name = 'Dora'), 'closed')$$,
  '23514', null, 'a draft cannot jump to closed');
select throws_ok(
  $$insert into public.execution_confirmations (request_id, executed_by, checks)
    select id, 'user_wf_admin', '{}' from ids where first_name = 'Dora'$$,
  '42501', null, 'section 9 cannot be filled in on a draft');

select is(
  public.transition_request((select id from ids where first_name = 'Dora'), 'in_execution'),
  'in_execution'::public.request_state, 'Raju starts execution');
select ok(
  (select execution_started_at > now() - interval '1 minute' and state_changed_at is not null
   from public.requests where first_name = 'Dora'),
  'the start time is set by the database');
select ok(
  exists (select 1 from public.audit_events where action = 'request.state_changed'
          and diff ->> 'from' = 'draft' and diff ->> 'to' = 'in_execution'),
  'the move is audited (from → to)');
select throws_ok(
  $$select public.transition_request((select id from ids where first_name = 'Dora'), 'draft')$$,
  '23514', null, 'there is no way back from in execution to draft');

select lives_ok(
  $$insert into public.execution_confirmations (request_id, executed_by, checks, notes)
    select id, 'someone_else', '{"access_provisioned": true, "devices_enrolled": true}', ' Laptop shipped '
    from ids where first_name = 'Dora'$$,
  'section 9 is filled in while executing');
select ok(
  (select executed_by = 'user_wf_admin' and notes = 'Laptop shipped'
   from public.execution_confirmations where request_id = (select id from ids where first_name = 'Dora')),
  '"executed by" is the signed-in user (supplied value ignored)');
select throws_ok(
  $$update public.execution_confirmations set checks = checks || '{"access_removed": true}'
    where request_id = (select id from ids where first_name = 'Dora')$$,
  '23514', null, 'an offboarding item does not apply to an onboarding request');
select throws_ok(
  $$update public.execution_confirmations set checks = '{"security_controls": "yes"}'
    where request_id = (select id from ids where first_name = 'Dora')$$,
  '23514', null, 'checklist answers are true / false');
select throws_ok(
  $$select public.transition_request((select id from ids where first_name = 'Dora'), 'pending_confirmation')$$,
  '23514', null, 'it cannot go for confirmation while the checklist is incomplete');

update public.execution_confirmations set checks = checks || '{"security_controls": true}'
where request_id = (select id from ids where first_name = 'Dora');
select ok(
  exists (select 1 from public.audit_events where action = 'request.execution_updated'
          and diff -> 'after' -> 'checks' ->> 'security_controls' = 'true'),
  'section 9 changes are audited');
select is(
  public.transition_request((select id from ids where first_name = 'Dora'), 'pending_confirmation'),
  'pending_confirmation'::public.request_state, 'with the checklist complete it goes for confirmation');
select is_empty(
  $$update public.execution_confirmations set notes = 'later' where request_id = (select id from ids where first_name = 'Dora') returning 1$$,
  'section 9 is locked once it awaits confirmation');

select throws_ok(
  $$select public.transition_request((select id from ids where first_name = 'Cara'), 'cancelled', '  ')$$,
  '23514', null, 'cancelling needs a reason');
select is(
  public.transition_request((select id from ids where first_name = 'Cara'), 'cancelled', 'Candidate withdrew'),
  'cancelled'::public.request_state, 'Raju cancels with a reason');
select ok(
  (select cancelled_by = 'user_wf_admin' and cancel_reason = 'Candidate withdrew' and cancelled_at is not null
   from public.requests where first_name = 'Cara'),
  'who, when and why are recorded');
select is_empty(
  $$update public.requests set job_title = 'x' where first_name = 'Cara' returning 1$$,
  'a cancelled request can no longer be edited');
select throws_ok(
  $$select public.transition_request((select id from ids where first_name = 'Cara'), 'in_execution')$$,
  '23514', null, 'a cancelled request stays cancelled');

-- ---------------------------------------------------------------------------
-- Approver
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"user_wf_approver","role":"authenticated"}', true);
select throws_ok(
  $$select public.transition_request((select id from ids where first_name = 'Olaf'), 'in_execution')$$,
  '42501', null, 'an approver cannot start execution');
select throws_ok(
  $$select public.transition_request((select id from ids where first_name = 'Dora'), 'returned')$$,
  '23514', null, 'returning needs a comment');
select is(
  public.transition_request((select id from ids where first_name = 'Dora'), 'returned', 'Add the VPN'),
  'returned'::public.request_state, 'Moises returns it with a comment');

select set_config('request.jwt.claims', '{"sub":"user_wf_admin","role":"authenticated"}', true);
select is(
  public.transition_request((select id from ids where first_name = 'Dora'), 'pending_confirmation'),
  'pending_confirmation'::public.request_state, 'Raju fixes it and sends it again');

select set_config('request.jwt.claims', '{"sub":"user_wf_approver","role":"authenticated"}', true);
select is(
  public.transition_request((select id from ids where first_name = 'Dora'), 'closed'),
  'closed'::public.request_state, 'Moises confirms and closes');
select ok(
  (select closed_at is not null from public.requests where first_name = 'Dora'),
  'the closing time is set by the database');

-- Owen was created by user_wf_both; bring it to confirmation as the owner, then try.
reset role;
select set_config('request.jwt.claims', '{"sub":"user_wf_admin","role":"authenticated"}', true);
select public.transition_request((select id from ids where first_name = 'Owen'), 'in_execution');
insert into public.execution_confirmations (request_id, executed_by, checks)
select id, 'user_wf_admin', '{"access_provisioned": true, "devices_enrolled": true, "security_controls": true}'
from ids where first_name = 'Owen';
select public.transition_request((select id from ids where first_name = 'Owen'), 'pending_confirmation');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_wf_both","role":"authenticated"}', true);
select throws_ok(
  $$select public.transition_request((select id from ids where first_name = 'Owen'), 'closed')$$,
  '42501', null, 'nobody confirms their own request');

select * from finish();
rollback;

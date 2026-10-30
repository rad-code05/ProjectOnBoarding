-- Admin · Users & roles (F18a): invitations, roles, deactivation and the
-- Role changes list for approvers (D5). Run: pnpm db:test
begin;
create extension if not exists pgtap with schema extensions;
select plan(52);

-- Only this test's people hold approver / admin (the local database may have
-- browser-test users; their roles come back when the test rolls back).
delete from public.user_roles where role in ('approver', 'admin');

insert into public.app_users (clerk_user_id, email, first_name, last_name) values
  ('user_ui_admin', 'ui-admin@example.test', 'Ada', 'Admin'),
  ('user_ui_abe',   'ui-abe@example.test',   'Abe', 'Approver'),
  ('user_ui_req',   'ui-req@example.test',   'Rea', 'Requester'),
  ('user_ui_aud',   'ui-aud@example.test',   'Aud', 'Itor');
insert into public.user_roles (clerk_user_id, role) values
  ('user_ui_admin', 'admin'), ('user_ui_admin', 'requester'), ('user_ui_admin', 'it_operator'),
  ('user_ui_abe', 'approver'),
  ('user_ui_req', 'requester'),
  ('user_ui_aud', 'auditor');

create temporary table ids (k text primary key, id uuid);
grant all on ids to authenticated, service_role;

set local role authenticated;

-- ---------------------------------------------------------------------------
-- Invitations
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"user_ui_abe","role":"authenticated"}', true);
select throws_ok(
  $$select public.admin_record_invitation('cy@example.test', 'Cy', 'New', '{approver}', 'inv_abc')$$,
  '42501', 'only an admin changes the lists', 'an approver cannot invite');

select set_config('request.jwt.claims', '{"sub":"user_ui_admin","role":"authenticated"}', true);
select is(
  public.admin_record_invitation('  Cy@Example.test ', 'Cy', 'New', '{approver}'),
  null, 'without a Clerk id it only checks');
select is((select count(*) from public.user_invitations), 0::bigint, '… and records nothing');
select throws_ok(
  $$select public.admin_record_invitation('not-an-email', 'Cy', 'New', '{approver}')$$,
  '23514', 'enter a valid work email', 'a work email is required');
select throws_ok(
  $$select public.admin_record_invitation('cy@example.test', '  ', 'New', '{approver}')$$,
  '23514', 'enter the first name (up to 80 characters)', 'a first name is required');
select throws_ok(
  $$select public.admin_record_invitation('cy@example.test', 'Cy', 'New', '{}')$$,
  '23514', 'choose at least one role', 'at least one role');
select throws_ok(
  $$select public.admin_record_invitation('UI-ABE@example.test', 'Abe', 'Again', '{auditor}')$$,
  '23505', 'ui-abe@example.test already has an account', 'someone who has an account is not invited');

insert into ids values ('cy', public.admin_record_invitation(
  'Cy@Example.test', ' Cy ', 'New', '{auditor,approver,approver}', 'inv_cy1'));
select ok(
  (select email = 'cy@example.test' and first_name = 'Cy' and roles = '{approver,auditor}'
          and status = 'pending' and invited_by = 'user_ui_admin'
          and expires_at between now() + interval '7 days' - interval '1 minute'
                             and now() + interval '7 days' + interval '1 minute'
   from public.user_invitations where id = (select id from ids where k = 'cy')),
  'an invitation is recorded: email in lower case, roles once each, 7 days');
select ok(
  exists (select 1 from public.audit_events
          where action = 'user.invited' and entity_id = (select id::text from ids where k = 'cy')
            and actor_id = 'user_ui_admin' and diff -> 'roles' = '["approver","auditor"]'),
  'inviting is audited with the roles');
select throws_ok(
  $$select public.admin_record_invitation('cy@example.test', 'Cy', 'New', '{auditor}', 'inv_cy2')$$,
  '23505', 'cy@example.test is already invited — send it again instead', 'one open invitation per email');
select throws_ok(
  $$insert into public.user_invitations (clerk_invitation_id, email, first_name, last_name, roles, invited_by, expires_at)
    values ('inv_x', 'x@example.test', 'X', 'Y', '{admin}', 'user_ui_admin', now())$$,
  '42501', null, 'nobody writes invitations directly');

-- Send again: the new Clerk invitation replaces the old one.
insert into ids values ('cy2', public.admin_resend_invitation((select id from ids where k = 'cy'), 'inv_cy3'));
select ok(
  (select status = 'replaced' and closed_by = 'user_ui_admin'
   from public.user_invitations where id = (select id from ids where k = 'cy'))
  and (select status = 'pending' and roles = '{approver,auditor}' and clerk_invitation_id = 'inv_cy3'
       from public.user_invitations where id = (select id from ids where k = 'cy2')),
  'send again: the old invitation is replaced by a new one with the same roles');
select ok(
  exists (select 1 from public.audit_events where action = 'user.invitation_sent_again'
          and entity_id = (select id::text from ids where k = 'cy2')),
  'sending again is audited');
select throws_ok(
  format('select public.admin_resend_invitation(%L, %L)', (select id from ids where k = 'cy'), 'inv_cy4'),
  '23514', 'this invitation is no longer open', 'a replaced invitation is not sent again');

-- Withdraw.
insert into ids values ('dee', public.admin_record_invitation('dee@example.test', 'Dee', 'Drop', '{requester}', 'inv_dee'));
select lives_ok(
  format('select public.admin_withdraw_invitation(%L)', (select id from ids where k = 'dee')),
  'an admin withdraws an invitation');
select ok(
  (select status = 'withdrawn' from public.user_invitations where id = (select id from ids where k = 'dee'))
  and exists (select 1 from public.audit_events where action = 'user.invitation_withdrawn'
              and entity_id = (select id::text from ids where k = 'dee')),
  '… it is withdrawn and audited');
select throws_ok(
  format('select public.admin_withdraw_invitation(%L)', (select id from ids where k = 'dee')),
  '23514', 'this invitation is no longer open', 'withdrawn once only');

-- ---------------------------------------------------------------------------
-- Clerk → app_users (webhook / sync script)
-- ---------------------------------------------------------------------------
select throws_ok(
  $$select public.sync_clerk_user('user_ui_x', 'x@example.test', 'X', 'Y')$$,
  '42501', null, 'only the server (service role) syncs Clerk users');

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(public.sync_clerk_user('user_ui_cy', 'CY@example.test', 'Cy', 'New'), 'accepted',
  'a new person with a pending invitation accepts it');
select is(
  (select array_agg(role::text order by role) from public.user_roles where clerk_user_id = 'user_ui_cy'),
  '{approver,auditor}'::text[], '… and gets its roles');
select is(
  (select count(*) from public.user_roles where clerk_user_id = 'user_ui_cy' and granted_by = 'user_ui_admin'),
  2::bigint, '… granted by the admin who invited them');
select ok(
  (select status = 'accepted' and accepted_user_id = 'user_ui_cy'
   from public.user_invitations where id = (select id from ids where k = 'cy2'))
  and exists (select 1 from public.audit_events where action = 'user.invitation_accepted'
              and entity_id = (select id::text from ids where k = 'cy2') and source = 'system'),
  '… the invitation is accepted, audited as system');
select is(public.sync_clerk_user('user_ui_dee', 'dee@example.test', 'Dee', 'Drop'), 'created',
  'a withdrawn invitation gives no roles');
select is((select count(*) from public.user_roles where clerk_user_id = 'user_ui_dee'), 0::bigint,
  '… no roles');
select is(public.sync_clerk_user('user_ui_cy', 'cy@example.test', 'Cyril', 'New'), 'updated',
  'an existing person is updated');
select is(public.sync_clerk_user('user_ui_dee', 'dee@example.test', 'Dee', 'Drop', true), 'updated',
  'banned in Clerk …');
select is((select active from public.app_users where clerk_user_id = 'user_ui_dee'), false,
  '… = deactivated');
select is(public.sync_clerk_user('user_ui_dee', 'dee@example.test', 'Dee', 'Drop', false), 'updated',
  'unbanned in Clerk …');
select is((select active from public.app_users where clerk_user_id = 'user_ui_dee'), false,
  '… still deactivated: only an admin reactivates');

-- ---------------------------------------------------------------------------
-- Roles, deactivate, reactivate
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_ui_admin","role":"authenticated"}', true);
select throws_ok(
  $$select public.admin_set_user_roles('user_ui_admin', '{admin,approver}')$$,
  '42501', 'nobody changes their own roles', 'nobody changes their own roles');
select throws_ok(
  $$select public.admin_deactivate_user('user_ui_admin')$$,
  '42501', 'nobody changes their own roles', 'nobody deactivates themselves');
select throws_ok(
  $$select public.admin_set_user_roles('user_ui_req', '{}')$$,
  '23514', 'choose at least one role', 'roles can''t be emptied (deactivate instead)');

select lives_ok(
  $$select public.admin_set_user_roles('user_ui_req', '{requester,it_operator}')$$,
  'an admin adds a role');
select is(
  (select granted_by from public.user_roles where clerk_user_id = 'user_ui_req' and role = 'it_operator'),
  'user_ui_admin', '… granted by them');

-- Cy (approver + auditor) is the second approver: Abe's approver role may go …
select lives_ok(
  $$select public.admin_set_user_roles('user_ui_abe', '{auditor}')$$,
  'an approver role is taken away while another approver remains');
select ok(
  exists (select 1 from public.audit_events where action = 'role.revoked'
          and entity_id = 'user_ui_abe' and diff ->> 'role' = 'approver' and actor_id = 'user_ui_admin'),
  '… audited as role.revoked by the admin');
-- … but not Cy's, the last one.
select throws_ok(
  $$select public.admin_set_user_roles('user_ui_cy', '{auditor}')$$,
  '23514', 'at least one active approver must remain', 'the last active approver keeps the role');
select throws_ok(
  $$select public.admin_deactivate_user('user_ui_cy')$$,
  '23514', 'at least one active approver must remain', 'the last active approver is not deactivated');
select ok(
  (select active from public.app_users where clerk_user_id = 'user_ui_cy')
  and exists (select 1 from public.user_roles where clerk_user_id = 'user_ui_cy' and role = 'approver'),
  '… nothing changed');

select lives_ok($$select public.admin_deactivate_user('user_ui_abe')$$, 'an admin deactivates someone');
select ok(
  (select not active from public.app_users where clerk_user_id = 'user_ui_abe')
  and not exists (select 1 from public.user_roles where clerk_user_id = 'user_ui_abe')
  and exists (select 1 from public.audit_events where action = 'user.deactivated' and entity_id = 'user_ui_abe'),
  '… no roles, inactive, audited — the person stays');
select throws_ok(
  $$select public.admin_set_user_roles('user_ui_abe', '{auditor}')$$,
  '23514', 'reactivate this person first', 'a deactivated person gets roles only by reactivating');
select lives_ok(
  $$select public.admin_reactivate_user('user_ui_abe', '{approver}')$$,
  'an admin reactivates someone with roles');
select ok(
  (select active from public.app_users where clerk_user_id = 'user_ui_abe')
  and exists (select 1 from public.user_roles where clerk_user_id = 'user_ui_abe' and role = 'approver')
  and exists (select 1 from public.audit_events where action = 'user.reactivated' and entity_id = 'user_ui_abe'),
  '… active again with the chosen roles, audited');
select throws_ok(
  $$select public.admin_record_invitation('dee@example.test', 'Dee', 'Drop', '{auditor}')$$,
  '23505', 'dee@example.test was deactivated — reactivate them instead',
  'a deactivated person is reactivated, not invited');

-- ---------------------------------------------------------------------------
-- Role changes for approvers (D5)
-- ---------------------------------------------------------------------------
reset role;
-- A browser-test user's role change is hidden from real people.
insert into public.app_users (clerk_user_id, email) values ('user_ui_e2e', 'e2e.someone+clerk_test@laine.ai');
insert into public.user_roles (clerk_user_id, role) values ('user_ui_e2e', 'auditor');
set local role authenticated;

select set_config('request.jwt.claims', '{"sub":"user_ui_abe","role":"authenticated"}', true);
select ok(
  exists (select 1 from public.role_changes(null, 100)
          where action = 'user.invited' and actor_name = 'Ada Admin' and target_name = 'Cy New'
            and roles = '{approver,auditor}'),
  'an approver sees who invited whom, with the roles');
select ok(
  exists (select 1 from public.role_changes(null, 100)
          where action = 'role.revoked' and target_name = 'Abe Approver' and roles = '{approver}' and is_new),
  '… role changes with names, new until seen');
select is(
  (select count(*) from public.role_changes(null, 100) where target_name like '%clerk_test%'),
  0::bigint, '… browser-test users are hidden');
select lives_ok($$select public.mark_role_changes_seen()$$, 'opening Role changes marks them seen');
select is((select count(*) from public.role_changes(null, 100) where is_new), 0::bigint,
  '… nothing is new afterwards');

select set_config('request.jwt.claims', '{"sub":"user_ui_req","role":"authenticated"}', true);
select throws_ok($$select * from public.role_changes()$$, '42501',
  'only approvers, admins and auditors see role changes', 'a requester does not see role changes');

-- The admin floor (an admin can never remove their own role, so it holds by
-- itself — the check still refuses a world without an active admin).
reset role;
delete from public.user_roles where role = 'admin';
select throws_ok($$select private.check_role_floor('{admin}')$$, '23514',
  'at least one active admin must remain', 'without an active admin the floor check refuses');

select * from finish();
rollback;

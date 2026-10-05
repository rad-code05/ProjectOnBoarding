-- RLS and integrity tests for app_users, user_roles and audit_events (S6).
-- Run: pnpm db:test   (needs the local database: pnpm db:start)
begin;
create extension if not exists pgtap with schema extensions;
select plan(32);

-- ---------------------------------------------------------------------------
-- Fixtures (fake people only). Inserted as the table owner, like the webhook.
-- ---------------------------------------------------------------------------
insert into public.app_users (clerk_user_id, email, first_name, last_name, active) values
  ('user_test_admin',    'admin@example.test',    'Ada',   'Admin',    true),
  ('user_test_approver', 'approver@example.test', 'Abe',   'Approver', true),
  ('user_test_auditor',  'auditor@example.test',  'Aud',   'Itor',     true),
  ('user_test_gone',     'gone@example.test',     'Gone',  'User',     false),
  ('user_test_norole',   'norole@example.test',   'No',    'Role',     true);

insert into public.user_roles (clerk_user_id, role) values
  ('user_test_admin', 'admin'),
  ('user_test_admin', 'requester'),
  ('user_test_admin', 'it_operator'),
  ('user_test_approver', 'approver'),
  ('user_test_auditor', 'auditor'),
  ('user_test_gone', 'admin');

-- ---------------------------------------------------------------------------
-- Integrity (as owner)
-- ---------------------------------------------------------------------------
select throws_ok(
  $$insert into public.user_roles (clerk_user_id, role, granted_by)
    values ('user_test_admin', 'approver', 'user_test_admin')$$,
  '23514', null,
  'nobody can grant a role to themselves');

select throws_ok(
  $$update public.user_roles set role = 'approver' where clerk_user_id = 'user_test_auditor'$$,
  '42501', null,
  'roles cannot be edited in place (revoke + grant instead)');

select throws_ok(
  $$insert into public.app_users (clerk_user_id, email) values ('not-a-clerk-id', 'x@example.test')$$,
  '23514', null,
  'app_users only accepts Clerk user IDs');

select throws_ok(
  $$insert into public.app_users (clerk_user_id, email) values ('user_test_upper', 'Upper@Example.test')$$,
  '23514', null,
  'emails are stored in lower case');

select throws_ok(
  $$insert into public.app_users (clerk_user_id, email) values ('user_test_dupe', 'admin@example.test')$$,
  '23505', null,
  'two active accounts cannot share an email');

select lives_ok(
  $$insert into public.app_users (clerk_user_id, email) values ('user_test_reinvite', 'gone@example.test')$$,
  'a deactivated user''s email can be reused by a new account');

-- Timestamps are set by the server, even if a value is supplied.
insert into public.app_users (clerk_user_id, email, created_at, updated_at)
values ('user_test_backdated', 'backdated@example.test', '2000-01-01', '2000-01-01');
select ok(
  (select created_at > now() - interval '1 minute' and updated_at > now() - interval '1 minute'
   from public.app_users where clerk_user_id = 'user_test_backdated'),
  'app_users timestamps cannot be backdated');

select ok(
  (select created_at > now() - interval '1 minute' from public.audit_events order by id desc limit 1),
  'audit_events.created_at is set by the server');

-- Audit trail written by triggers
select ok(
  exists (select 1 from public.audit_events
          where action = 'user.created' and entity_id = 'user_test_admin' and source = 'system'),
  'creating a user writes user.created');

select ok(
  exists (select 1 from public.audit_events
          where action = 'role.granted' and entity_id = 'user_test_approver' and diff ->> 'role' = 'approver'),
  'granting a role writes role.granted');

update public.app_users set active = false where clerk_user_id = 'user_test_backdated';
select ok(
  exists (select 1 from public.audit_events
          where action = 'user.deactivated' and entity_id = 'user_test_backdated'),
  'deactivating a user writes user.deactivated');

select is(
  (select count(*) from public.audit_events where entity_id = 'user_test_admin' and action = 'user.updated'),
  0::bigint,
  'before: no user.updated events');
update public.app_users set first_name = 'Ada' where clerk_user_id = 'user_test_admin';
select is(
  (select count(*) from public.audit_events where entity_id = 'user_test_admin' and action = 'user.updated'),
  0::bigint,
  'an update that changes nothing is not audited');

delete from public.user_roles where clerk_user_id = 'user_test_gone' and role = 'admin';
select ok(
  exists (select 1 from public.audit_events where action = 'role.revoked' and entity_id = 'user_test_gone'),
  'revoking a role writes role.revoked');

-- ---------------------------------------------------------------------------
-- Append-only audit log — even the service role cannot change history
-- ---------------------------------------------------------------------------
set local role service_role;
select throws_ok($$update public.audit_events set action = 'x.y'$$, '42501', null,
  'service_role cannot update audit events');
select throws_ok($$delete from public.audit_events$$, '42501', null,
  'service_role cannot delete audit events');
reset role;
select throws_ok($$update public.audit_events set action = 'x.y'$$, '42501', null,
  'even the owner cannot update audit events (trigger)');
select throws_ok($$delete from public.audit_events$$, '42501', null,
  'even the owner cannot delete audit events (trigger)');
select throws_ok($$truncate public.audit_events$$, '42501', null,
  'even the owner cannot truncate audit events (trigger)');

-- ---------------------------------------------------------------------------
-- anon: no access at all
-- ---------------------------------------------------------------------------
set local role anon;
select throws_ok($$select * from public.app_users$$, '42501', null, 'anon cannot read app_users');
select throws_ok($$select * from public.user_roles$$, '42501', null, 'anon cannot read user_roles');
select throws_ok($$select * from public.audit_events$$, '42501', null, 'anon cannot read audit_events');
reset role;

-- ---------------------------------------------------------------------------
-- Approver: sees only themselves; cannot change roles or read the audit log
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_test_approver","role":"authenticated"}', true);

select results_eq(
  $$select clerk_user_id from public.app_users$$,
  array['user_test_approver'],
  'approver reads only their own user row');
select results_eq(
  $$select role::text from public.user_roles$$,
  array['approver'],
  'approver reads only their own roles');
select is_empty($$select * from public.audit_events$$, 'approver cannot read the audit log');
select throws_ok(
  $$insert into public.user_roles (clerk_user_id, role) values ('user_test_approver', 'admin')$$,
  '42501', null,
  'approver cannot grant themselves a role');
select lives_ok(
  $$insert into public.audit_events (actor_id, action, entity, source)
    values ('user_test_approver', 'test.event', 'test', 'user')$$,
  'active user can append an event in their own name');
select throws_ok(
  $$insert into public.audit_events (actor_id, action, entity, source)
    values ('user_test_admin', 'test.event', 'test', 'user')$$,
  '42501', null,
  'a user cannot write events in someone else''s name');

-- ---------------------------------------------------------------------------
-- Admin / auditor: read everything
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"user_test_admin","role":"authenticated"}', true);
select ok((select count(*) >= 5 from public.app_users), 'admin reads all users');
select ok((select count(*) > 0 from public.audit_events), 'admin reads the audit log');

select set_config('request.jwt.claims', '{"sub":"user_test_auditor","role":"authenticated"}', true);
select ok((select count(*) > 0 from public.audit_events), 'auditor reads the audit log');

-- ---------------------------------------------------------------------------
-- Deactivated user / unknown user: nothing
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"user_test_gone","role":"authenticated"}', true);
select is_empty($$select * from public.app_users$$, 'a deactivated user sees nothing');

select * from finish();
rollback;

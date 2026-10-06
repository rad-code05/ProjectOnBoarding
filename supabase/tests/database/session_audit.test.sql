-- Sign-in/out audit events written by the Clerk webhook (S7c).
-- Run: pnpm db:test   (needs the local database: pnpm db:start)
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

-- The webhook uses the secret key = service_role.
set local role service_role;
select lives_ok(
  $$insert into public.audit_events (actor_id, action, entity, entity_id, source, diff)
    values ('user_test_session', 'session.created', 'session', 'sess_test_1', 'user',
            '{"status": "active", "client_id": "client_test"}')$$,
  'service_role can log a sign-in');
select lives_ok(
  $$insert into public.audit_events (actor_id, action, entity, entity_id, source, created_at)
    values ('user_test_session', 'session.removed', 'session', 'sess_test_1', 'user',
            '2000-01-01T00:00:00Z')$$,
  'service_role can log a sign-out');
reset role;

select is(
  (select count(*)::int from public.audit_events where entity_id = 'sess_test_1'),
  2,
  'both session events are stored');
select ok(
  (select created_at > now() - interval '1 minute' from public.audit_events
   where entity_id = 'sess_test_1' and action = 'session.removed'),
  'a sign-out cannot be backdated: the database sets created_at');

select * from finish();
rollback;

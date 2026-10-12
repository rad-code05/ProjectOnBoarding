-- Each person's own display timezone: only their own, validated, audited;
-- null = the company timezone. Run: pnpm db:test
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into public.app_users (clerk_user_id, email, first_name, last_name) values
  ('user_tz_raju',   'tz-raju@example.test',   'Raju',   'Test'),
  ('user_tz_moises', 'tz-moises@example.test', 'Moises', 'Test');
insert into public.user_roles (clerk_user_id, role) values
  ('user_tz_raju', 'admin'), ('user_tz_moises', 'approver');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_tz_moises","role":"authenticated"}', true);

select is(public.my_timezone(), 'Asia/Dubai', 'without a choice, screens use the company timezone');
select is(public.set_my_timezone('Europe/Zurich'), 'Europe/Zurich', 'a person sets their own timezone');
select is(public.my_timezone(), 'Europe/Zurich', 'their screens now use it');
select throws_ok($$select public.set_my_timezone('Mars/Olympus')$$,
  '23514', 'unknown timezone: Mars/Olympus', 'an unknown timezone is refused');
select throws_ok($$update public.app_users set timezone = 'UTC' where clerk_user_id = 'user_tz_moises'$$,
  '42501', null, 'nobody changes the column directly');

select set_config('request.jwt.claims', '{"sub":"user_tz_raju","role":"authenticated"}', true);
select is(public.my_timezone(), 'Asia/Dubai', 'someone else''s choice changes nothing for me');
select is(private.company_timezone(), 'Asia/Dubai', 'nor the company timezone (PDF, tickets, reports)');

select set_config('request.jwt.claims', '{"sub":"user_tz_moises","role":"authenticated"}', true);
select is(public.set_my_timezone(null), 'Asia/Dubai', 'clearing it goes back to the company timezone');
select is(public.my_timezone(), 'Asia/Dubai', 'and the screens follow the company again');

reset role;
select is(
  (select count(*)::int from public.audit_events
   where action = 'account.timezone_changed' and entity_id = 'user_tz_moises'),
  2, 'each change is audited (set, then cleared)');

select * from finish();
rollback;

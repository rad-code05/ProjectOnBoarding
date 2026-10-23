-- The assistant's database (F15a): models + settings (admin only, audited,
-- retire not delete, the model in use can't be retired), own chats /
-- messages / memory only, server times, usage → cost, the status the chat
-- route checks (off / budget / rate), clearing your own data, the 60-day
-- purge and its daily job. Run: pnpm db:test
begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

insert into public.app_users (clerk_user_id, email, first_name, last_name) values
  ('user_ai_admin', 'ai-admin@example.test', 'Ada', 'Admin'),
  ('user_ai_approver', 'ai-approver@example.test', 'Moe', 'Approver');
insert into public.user_roles (clerk_user_id, role) values
  ('user_ai_admin', 'admin'), ('user_ai_approver', 'approver');

-- 1–3. Seeds ---------------------------------------------------------------------------------------------
select is((select array_agg(model_id order by sort_order) from public.ai_models),
  array['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-4-5'], 'three models to start');
select is((select row(s.enabled, m.model_id, s.monthly_budget_usd, s.hourly_limit)::text
           from public.ai_settings s join public.ai_models m on m.id = s.model),
  row(true, 'claude-sonnet-5-5', 50.00::numeric(10, 2), 30)::text,
  'on, Sonnet 5.5, $50 a month, 30 questions an hour');
select is((select count(*)::int from cron.job where jobname = 'purge-old-ai-chats'), 1,
  'the 60-day purge runs every day');

-- A chat of Moe's that is 61 days old, and one of Ada's (fixture times, triggers off).
alter table public.ai_chats disable trigger ai_chats_timestamps;
insert into public.ai_chats (id, user_id, title, created_at, updated_at) values
  ('00000000-0000-0000-0000-00000000a001', 'user_ai_approver', 'Old', now() - interval '70 days', now() - interval '61 days'),
  ('00000000-0000-0000-0000-00000000a002', 'user_ai_admin', 'Ada''s', now() - interval '2 days', now() - interval '2 days');
alter table public.ai_chats enable trigger ai_chats_timestamps;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_ai_approver","role":"authenticated"}', true);

-- 4–9. Own chats, messages and memory ---------------------------------------------------------------------
insert into public.ai_chats (id, title, created_at)
values ('00000000-0000-0000-0000-00000000a003', 'Signature log', '2020-01-01');
select is((select row(user_id, created_at > now() - interval '1 minute')::text
           from public.ai_chats where id = '00000000-0000-0000-0000-00000000a003'),
  row('user_ai_approver', true)::text, 'a new chat is mine, with the server time');
select is((select array_agg(title order by title) from public.ai_chats), array['Old', 'Signature log'],
  'I see only my own chats');
select throws_ok($$insert into public.ai_chats (user_id, title) values ('user_ai_admin', 'x')$$,
  '42501', null, 'no chat in someone else''s name');
insert into public.ai_messages (chat_id, role, parts)
values ('00000000-0000-0000-0000-00000000a003', 'user', '[{"type":"text","text":"How long did approvals take?"}]');
select throws_ok($$insert into public.ai_messages (chat_id, role, parts)
                   values ('00000000-0000-0000-0000-00000000a002', 'user', '[]')$$,
  '42501', null, 'no message in someone else''s chat');
insert into public.ai_memory (call_me, favourite_reports) values ('Moises', array['Signature log']);
select is((select row(user_id, call_me)::text from public.ai_memory), row('user_ai_approver', 'Moises')::text,
  'my memory row');
select is((select count(*)::int from public.ai_messages), 1, 'my messages only');

-- 10–15. Status, usage and cost ----------------------------------------------------------------------------
select is((select reason from public.ai_status()), 'ok', 'status: may ask');
select is(public.record_ai_usage((select id from public.ai_models where model_id = 'claude-sonnet-5-5'), 1000, 500),
  0.007000::numeric, 'cost = 1000 × $2 + 500 × $10 per million');
select is((select row(asked_last_hour, spent_this_month_usd)::text from public.ai_status()),
  row(1, 0.01::numeric)::text, 'one question this hour; spend rounded to cents');
select throws_ok($$select public.record_ai_usage(1::smallint, -1, 0)$$, '23514', null, 'no negative tokens');
select is((select count(*)::int from public.ai_usage), 1, 'I see my own usage');
select throws_ok($$select * from public.ai_usage_this_month()$$, '42501', null, 'this month''s use: admins only');

-- 16–17. Not an admin ---------------------------------------------------------------------------------------
select throws_ok($$select public.admin_save_ai_model(null, 'X', 'claude-x', null, 1, 1)$$, '42501', null,
  'only an admin adds a model');
select throws_ok($$select public.admin_save_ai_settings(false, 1::smallint, 50, 30)$$, '42501', null,
  'only an admin changes the settings');

-- 18–25. Admin: models and settings --------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"user_ai_admin","role":"authenticated"}', true);
select lives_ok($$select public.admin_save_ai_model(null, 'Claude Haiku 5.5', 'claude-haiku-5-5', 'Cheapest.', 0.1, 0.5)$$,
  'an admin adds a model');
select is((select row(name, price_in, price_out, active)::text from public.ai_models where model_id = 'claude-haiku-5-5'),
  row('Claude Haiku 5.5', 0.1000::numeric(10, 4), 0.5000::numeric(10, 4), true)::text, 'with its prices');
select throws_ok($$select public.admin_save_ai_model(null, 'Another', 'claude-haiku-5-5', null, 1, 1)$$, '23505', null,
  'each model ID once');
select throws_ok($$select public.admin_save_ai_model(null, 'Bad', 'Claude Opus!', null, 1, 1)$$, '23514', null,
  'a model ID has lower-case letters, digits, dots and dashes');
select throws_ok($$select public.admin_set_ai_model_active((select id from public.ai_models where model_id = 'claude-sonnet-5-5'), false)$$,
  '23514', null, 'the model in use can''t be retired');
select lives_ok($$select public.admin_set_ai_model_active((select id from public.ai_models where model_id = 'claude-haiku-4-5'), false)$$,
  'another model is retired, not deleted');
select throws_ok($$select public.admin_save_ai_settings(true, (select id from public.ai_models where model_id = 'claude-haiku-4-5'), 50, 30)$$,
  '23514', null, 'a retired model can''t be chosen');
select is((select array_agg(action order by id) from public.audit_events where action like 'ai.%'),
  array['ai.model_added', 'ai.model_retired'], 'model changes are audited');

-- 26–28. Off, budget, rate ---------------------------------------------------------------------------------------
select public.admin_save_ai_settings(false, (select id from public.ai_models where model_id = 'claude-sonnet-5-5'), 50, 30);
select is((select reason from public.ai_status()), 'off', 'off = nobody may ask');
select public.admin_save_ai_settings(true, (select id from public.ai_models where model_id = 'claude-sonnet-5-5'), 0, 30);
select is((select row(reason, resets_at > now())::text from public.ai_status()), row('budget', true)::text,
  'budget used up — until next month');
select set_config('request.jwt.claims', '{"sub":"user_ai_approver","role":"authenticated"}', true);
select is((select reason from public.ai_status()), 'budget', 'the budget is shared by everyone');

-- 29–30. Clearing my own data; the purge ----------------------------------------------------------------------------
select public.forget_my_ai_memory();
select is((select count(*)::int from public.ai_memory), 0, 'my memory is cleared');
reset role;
select is(private.purge_old_ai_chats(), 1, 'the purge deletes the chat older than 60 days, nothing else');

select * from finish();
rollback;

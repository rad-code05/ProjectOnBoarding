-- F15d-2e: delete ONE of your own assistant chats — never someone else's,
-- its messages go with it, audited without the content. Run: pnpm db:test
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into public.app_users (clerk_user_id, email, first_name, last_name) values
  ('user_chat_a', 'chat-a@example.test', 'Ann', 'A'),
  ('user_chat_b', 'chat-b@example.test', 'Bob', 'B');
insert into public.user_roles (clerk_user_id, role) values
  ('user_chat_a', 'admin'), ('user_chat_b', 'approver');
insert into public.ai_chats (id, user_id, title) values
  ('00000000-0000-0000-0000-00000000c001', 'user_chat_a', 'Who has Admin?'),
  ('00000000-0000-0000-0000-00000000c002', 'user_chat_a', 'Signature log'),
  ('00000000-0000-0000-0000-00000000c003', 'user_chat_b', 'Bob''s');
insert into public.ai_messages (chat_id, role, parts) values
  ('00000000-0000-0000-0000-00000000c001', 'user', '[{"type":"text","text":"Who has Admin?"}]');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_chat_a","role":"authenticated"}', true);

select is(public.delete_my_ai_chat('00000000-0000-0000-0000-00000000c003'), false,
  'someone else''s chat: nothing deleted');
select is(public.delete_my_ai_chat('00000000-0000-0000-0000-00000000c001'), true,
  'my own chat: deleted');
select is((select array_agg(title) from public.ai_chats), array['Signature log'],
  'only that one went; my other chat stays');
reset role;
select is((select count(*)::int from public.ai_chats where user_id = 'user_chat_b'), 1,
  'Bob''s chat is untouched');
select is((select count(*)::int from public.ai_messages
           where chat_id = '00000000-0000-0000-0000-00000000c001'), 0,
  'its messages went with it');
select is((select diff::text from public.audit_events
           where action = 'ai.chat_deleted' and entity_id = 'user_chat_a'),
  '{"chats": 1}', 'audited without the title or text');

select * from finish();
rollback;

-- Section 9 notes by the robot (F16e-1): a draft of the implementation notes
-- is a suggestion; accepting it writes the notes like typing them — only in
-- execution, after notes already there (never replacing them), audited as
-- the assistant's. The checklist ticks are never touched.
-- Run: pnpm db:test
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into public.app_users (clerk_user_id, email, first_name, last_name) values
  ('user_en_admin', 'en-admin@example.test', 'Ada', 'Admin'),
  ('user_en_abe',   'en-abe@example.test',   'Abe', 'Approver');
insert into public.user_roles (clerk_user_id, role) values
  ('user_en_admin', 'admin'), ('user_en_admin', 'requester'), ('user_en_admin', 'it_operator'),
  ('user_en_abe', 'approver');

insert into public.requests
  (created_by, first_name, last_name, work_email, job_title, department_id, country,
   manager_name, requestor_name, effective_date, office_id)
values ('user_en_admin', 'Nina', 'Test', 'nina.en@example.test', 'Analyst',
  (select id from public.departments where name = 'Sales'), 'AE', 'Mara Manager', 'Rita Requestor',
  date '2026-11-02', (select id from public.offices where name = 'Dubai'));
create temporary table req as select id from public.requests where work_email = 'nina.en@example.test';
grant select on req to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_en_admin","role":"authenticated"}', true);

-- 1–3. Suggest ---------------------------------------------------------------------------------------
select is(public.suggest_request_values((select id from req), jsonb_build_array(
    jsonb_build_object('kind', 'execution_notes', 'target', 'execution_notes',
      'value', 'Slack: Regular Member granted, invite sent.'))),
  1, 'a draft of the implementation notes');
select throws_ok(format($$select public.suggest_request_values(%L, jsonb_build_array(jsonb_build_object(
    'kind', 'execution_notes', 'target', 'execution_notes', 'value', repeat('x', 2001))))$$,
    (select id from req)),
  '22023', null, 'at most 2000 characters');
select throws_ok(format($$select public.suggest_request_values(%L,
    '[{"kind":"execution_notes","target":"execution_notes","value":{"checks":{"access_provisioned":true}}}]')$$,
    (select id from req)),
  '22023', null, 'only a text — never the checklist');

-- 4. In the draft it waits for Start execution ----------------------------------------------------------
select throws_ok($$select public.accept_request_suggestion(id) from public.request_suggestions
                   where request_id = (select id from req) and kind = 'execution_notes'$$,
  '42501', null, 'implementation notes are written once execution has started');

-- 5–7. In execution: added after what was typed --------------------------------------------------------
select public.transition_request(id, 'in_execution') from req;
insert into public.execution_confirmations (request_id, executed_by, checks, notes)
select id, 'user_en_admin', '{"access_provisioned": true}', 'Laptop handed over.' from req;
select lives_ok($$select public.accept_request_suggestion(id) from public.request_suggestions
                  where request_id = (select id from req) and kind = 'execution_notes' and status = 'pending'$$,
  'accepting once execution has started');
select is((select notes from public.execution_confirmations where request_id = (select id from req)),
  E'Laptop handed over.\n\nSlack: Regular Member granted, invite sent.',
  'added after the typed notes, never replacing them');
select is((select checks from public.execution_confirmations where request_id = (select id from req)),
  '{"access_provisioned": true}'::jsonb, 'the checklist is untouched');

-- 8. Audited as the assistant's -----------------------------------------------------------------------
reset role;
select ok((select bool_and(source = 'ai') from public.audit_events
           where entity_id = (select id::text from req) and action = 'request.execution_updated'
             and diff -> 'after' ->> 'notes' like '%invite sent%'),
  'the notes change is audited with source ai');

-- 9. An approver can't suggest --------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_en_abe","role":"authenticated"}', true);
select throws_ok(format($$select public.suggest_request_values(%L,
    '[{"kind":"execution_notes","target":"execution_notes","value":"x"}]')$$, (select id from req)),
  '42501', null, 'only admins and requesters prepare requests');

select * from finish();
rollback;

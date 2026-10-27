-- Offboarding by chat, part B2: the robot may suggest how each application
-- is removed and what happens to the mailbox; they are accepted through the
-- screen's own steps — once execution has started — audited as the
-- assistant's. Only on offboardings, only that request's rows.
-- Run: pnpm db:test
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into public.app_users (clerk_user_id, email, first_name, last_name) values
  ('user_os_admin', 'os-admin@example.test', 'Ada', 'Admin'),
  ('user_os_abe',   'os-abe@example.test',   'Abe', 'Approver');
insert into public.user_roles (clerk_user_id, role) values
  ('user_os_admin', 'admin'), ('user_os_admin', 'requester'), ('user_os_admin', 'it_operator'),
  ('user_os_abe', 'approver');
insert into public.signature_assets (user_id, kind, source, typed_text) values
  ('user_os_admin', 'initials', 'typed', 'AA'), ('user_os_abe', 'initials', 'typed', 'AB');

-- Omar's closed onboarding: Slack.
insert into public.requests
  (created_by, first_name, last_name, work_email, job_title, department_id, country,
   manager_name, requestor_name, effective_date, office_id)
values ('user_os_admin', 'Omar', 'Test', 'omar.os@example.test', 'Analyst',
  (select id from public.departments where name = 'Sales'), 'AE', 'Mara Manager', 'Rita Requestor',
  date '2026-01-05', (select id from public.offices where name = 'Dubai'));
create temporary table onb as select id from public.requests where work_email = 'omar.os@example.test';
grant select on onb to authenticated;
insert into public.request_access_items (request_id, app_id, action, permission)
select (select id from onb), id, 'Grant', 'Regular Member' from public.catalog_apps where name = 'Slack';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_os_admin","role":"authenticated"}', true);
select public.transition_request(id, 'in_execution') from onb;
insert into public.execution_confirmations (request_id, executed_by, checks)
select id, 'user_os_admin', '{"access_provisioned": true, "devices_enrolled": true, "security_controls": true}' from onb;
select public.sign_request(id, public.request_snapshot_preview(id)) from onb;
reset role;
create temporary table reviewed as select private.request_snapshot_data(id) as data from onb;
grant select on reviewed to authenticated;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_os_abe","role":"authenticated"}', true);
select public.confirm_request(id, (select data from reviewed)) from onb;

select set_config('request.jwt.claims', '{"sub":"user_os_admin","role":"authenticated"}', true);
create temporary table off (id uuid);
insert into off select public.ai_start_request('offboarding',
  (select id from public.employees where work_email = 'omar.os@example.test'));
create temporary table slack as
  select id from public.request_access_items where request_id = (select id from off);

-- 1–3. Suggest --------------------------------------------------------------------------------------
select is(public.suggest_request_values((select id from off), jsonb_build_array(
    jsonb_build_object('kind', 'removal', 'target', 'removal:' || (select id from slack),
      'value', jsonb_build_object('method', 'Suspend'), 'reason', 'you said so'),
    jsonb_build_object('kind', 'mailbox', 'target', 'mailbox', 'value', 'converted_shared'))),
  2, 'how Slack is removed, and the mailbox');
select throws_ok(format($$select public.suggest_request_values(%L, '[{"kind":"removal","target":"removal:%s","value":{"method":"Shred"}}]')$$,
    (select id from off), (select id from slack)),
  '22023', null, 'only Delete, Suspend or Disable');
select throws_ok(format($$select public.suggest_request_values(%L, '[{"kind":"mailbox","target":"mailbox","value":"forward"}]')$$,
    (select id from off)),
  '22023', null, 'the mailbox is converted to shared, or there is none');

-- 4. Like on the screen: recorded once execution has started -----------------------------------------
select throws_ok($$select public.accept_request_suggestion(id) from public.request_suggestions
                   where request_id = (select id from off) and kind = 'removal'$$,
  '23514', null, 'in the draft the method waits for Start execution');

-- 5–8. In execution: accepted through set_removal / set_mailbox_handling ------------------------------
update public.requests set sla_timeline = 'within_24h', access_cutoff_at = now() + interval '1 hour',
  last_working_day = current_date where id = (select id from off);
select public.transition_request(id, 'in_execution') from off;
select lives_ok($$select public.accept_request_suggestion(id) from public.request_suggestions
                  where request_id = (select id from off) and status = 'pending'$$,
  'accepting both once execution has started');
select is((select removal_method from public.request_access_items where id = (select id from slack)),
  'Suspend', 'Slack: Suspend');
select is((select mailbox_handling from public.requests where id = (select id from off)),
  'converted_shared', 'the mailbox: converted to a shared mailbox');
select ok((select bool_and(source = 'ai') from public.audit_events
           where entity_id = (select id::text from off)
             and action in ('request.removal_method_set', 'request.mailbox_set')),
  'audited as the assistant''s');

select * from finish();
rollback;

-- Filling requests by chat (F16a): the assistant's suggestions wait until the
-- person accepts (saved like typing — RLS, checks, version + 1 — audited
-- source = ai) or rejects them; only admins and requesters suggest, only on
-- open requests and catalog targets; a newer suggestion replaces a waiting
-- one; drafts created by the assistant are audited source = ai.
-- Run: pnpm db:test
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

insert into public.app_users (clerk_user_id, email, first_name, last_name) values
  ('user_rs_admin', 'rs-admin@example.test', 'Ada', 'Admin'),
  ('user_rs_approver', 'rs-approver@example.test', 'Moe', 'Approver'),
  ('user_rs_it', 'rs-it@example.test', 'Ivy', 'Operator');
insert into public.user_roles (clerk_user_id, role) values
  ('user_rs_admin', 'admin'), ('user_rs_admin', 'requester'),
  ('user_rs_approver', 'approver'), ('user_rs_it', 'it_operator');

-- A closed request with a suggestion still waiting (fixture, triggers off).
alter table public.requests disable trigger user;
insert into public.requests
  (id, ticket_id, ticket_year, ticket_number, type, state, created_by, first_name, last_name,
   form_version_id, closed_at)
values ('00000000-0000-0000-0000-00000000a5c1', 'UAM-2026-960001', 2026, 960001, 'onboarding',
  'closed', 'user_rs_admin', 'Old', 'Closed', (select id from public.form_versions where version = '4.2'), now());
alter table public.requests enable trigger user;
insert into public.request_suggestions (id, request_id, kind, target, value, created_by)
values ('00000000-0000-0000-0000-00000000a5c2', '00000000-0000-0000-0000-00000000a5c1', 'field',
  'manager_name', '"Late Manager"', 'user_rs_admin');

-- 1–2. The table ----------------------------------------------------------------------------------------
select has_table('public', 'request_suggestions', 'suggestions have their own table');
select is((select relrowsecurity from pg_class where oid = 'public.request_suggestions'::regclass), true,
  'row level security is on');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_rs_admin","role":"authenticated"}', true);

-- 3–4. The assistant starts a draft (after Confirm) ----------------------------------------------------
create temporary table t (id uuid) on commit drop;
insert into t select public.ai_start_request('onboarding');
select is((select state::text from public.requests where id = (select id from t)), 'draft',
  'the assistant''s draft is a normal draft');
select is((select source::text from public.audit_events
           where action = 'request.created' and entity_id = (select id::text from t)), 'ai',
  'its creation is audited as the assistant''s');
select throws_ok($$select public.ai_start_request('onboarding', gen_random_uuid())$$,
  '22023', null, 'an onboarding starts without a person');

-- 6–11. Suggest ------------------------------------------------------------------------------------------
select is(public.suggest_request_values((select id from t), jsonb_build_array(
    jsonb_build_object('kind', 'field', 'target', 'manager_name', 'value', 'Omar Haddad', 'reason', 'you said so'),
    jsonb_build_object('kind', 'field', 'target', 'department_id',
      'value', (select id from public.departments order by id limit 1)),
    jsonb_build_object('kind', 'access', 'target', 'app:' || (select id from public.catalog_apps where name = 'Slack'),
      'value', jsonb_build_object('action', 'Grant', 'permission', 'Regular Member')),
    jsonb_build_object('kind', 'physical', 'target', 'access:' || (select min(id) from public.physical_access_types),
      'value', jsonb_build_object('action', 'Grant')))),
  4, 'four suggestions saved');
select is((select source::text from public.audit_events
           where action = 'request.suggested' and entity_id = (select id::text from t)), 'ai',
  'suggesting is audited once, as the assistant''s');
select is(public.suggest_request_values((select id from t),
    '[{"kind":"field","target":"manager_name","value":"Omar Haddad Jr"}]'), 1,
  'a newer suggestion for the same field');
select is((select array_agg(status order by status) from public.request_suggestions
           where request_id = (select id from t) and target = 'manager_name'),
  array['pending', 'replaced'], '… replaces the waiting one');
select throws_ok($$select public.suggest_request_values((select id from t), '[{"kind":"field","target":"state","value":"closed"}]')$$,
  '22023', 'unknown field state', 'never the state (or any field outside sections 1–2)');
select throws_ok($$select public.suggest_request_values((select id from t), '[{"kind":"access","target":"app:9999","value":{}}]')$$,
  '22023', 'unknown application app:9999', 'only applications from the catalog');
select throws_ok($$select public.suggest_request_values('00000000-0000-0000-0000-00000000a5c1', '[{"kind":"field","target":"manager_name","value":"x"}]')$$,
  '22023', 'this request can''t be changed any more', 'never on a closed request');
select throws_ok($$insert into public.request_suggestions (request_id, kind, target, value, created_by)
                   values ((select id from t), 'field', 'manager_name', '"x"', 'user_rs_admin')$$,
  '42501', null, 'suggestions are written only through the function');

-- 14–19. Accept and reject ------------------------------------------------------------------------------
select is((public.accept_request_suggestion(
    (select id from public.request_suggestions where request_id = (select id from t)
       and target = 'manager_name' and status = 'pending')) ->> 'version')::int, 2,
  'accepting saves like typing: version + 1, returned to the form');
select is((select manager_name from public.requests where id = (select id from t)), 'Omar Haddad Jr',
  'the request now has the value');
select is((select source::text from public.audit_events
           where action = 'request.updated' and entity_id = (select id::text from t)
           order by created_at desc limit 1), 'ai',
  'the change is audited as the assistant''s');
select throws_ok($$select public.accept_request_suggestion(
    (select id from public.request_suggestions where request_id = (select id from t) and target = 'manager_name' and status = 'accepted'))$$,
  '22023', 'this suggestion is no longer waiting', 'a suggestion is accepted once');
select lives_ok($$select public.accept_request_suggestion(
    (select id from public.request_suggestions where request_id = (select id from t) and kind = 'access'))$$,
  'accepting an application');
select is((select app_name || ' · ' || permission from public.request_access_items where request_id = (select id from t)),
  'Slack · Regular Member', '… adds it to section 5 with the catalog name');
select lives_ok($$select public.reject_request_suggestion(
    (select id from public.request_suggestions where request_id = (select id from t) and kind = 'physical'))$$,
  'rejecting an access type');
select is((select count(*)::int from public.request_physical_access_items where request_id = (select id from t)), 0,
  '… leaves section 7 as it was');
select throws_ok($$select public.accept_request_suggestion('00000000-0000-0000-0000-00000000a5c2')$$,
  '42501', null, 'a waiting suggestion can''t change a closed request');

-- 23–24. Who ---------------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"user_rs_it","role":"authenticated"}', true);
select throws_ok($$select public.suggest_request_values((select id from t), '[{"kind":"field","target":"job_title","value":"x"}]')$$,
  '42501', null, 'IT operators accept, but the assistant doesn''t suggest for them');
select set_config('request.jwt.claims', '{"sub":"user_rs_approver","role":"authenticated"}', true);
select is((select count(*)::int from public.request_suggestions), 0, 'approvers never see suggestions');

select * from finish();
rollback;

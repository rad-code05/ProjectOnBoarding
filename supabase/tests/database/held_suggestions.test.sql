-- Access changes by chat (F16d-2): the assistant may suggest a change to an
-- item the person holds, only on their access change; accepting writes the
-- line the access-change screen writes (linked to the held item, audited as
-- the assistant's); items they don't hold, other requests and other people's
-- items are refused.
-- Run: pnpm db:test
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into public.app_users (clerk_user_id, email, first_name, last_name) values
  ('user_hs_admin', 'hs-admin@example.test', 'Ada', 'Admin'),
  ('user_hs_abe',   'hs-abe@example.test',   'Abe', 'Approver');
insert into public.user_roles (clerk_user_id, role) values
  ('user_hs_admin', 'admin'), ('user_hs_admin', 'requester'), ('user_hs_admin', 'it_operator'),
  ('user_hs_abe', 'approver');
insert into public.signature_assets (user_id, kind, source, typed_text) values
  ('user_hs_admin', 'initials', 'typed', 'AA'),
  ('user_hs_abe', 'initials', 'typed', 'AB');

-- Hana's closed onboarding: Slack and a laptop.
insert into public.requests
  (created_by, first_name, last_name, work_email, job_title, department_id, country,
   manager_name, requestor_name, effective_date, office_id)
values ('user_hs_admin', 'Hana', 'Test', 'hana.hs@example.test', 'Analyst',
  (select id from public.departments where name = 'Sales'), 'AE',
  'Mara Manager', 'Rita Requestor', date '2026-01-05',
  (select id from public.offices where name = 'Dubai'));
create temporary table onb as select id from public.requests where work_email = 'hana.hs@example.test';
grant select on onb to authenticated;
insert into public.request_access_items (request_id, app_id, action, permission)
select (select id from onb), id, 'Grant', 'Regular Member' from public.catalog_apps where name = 'Slack';
insert into public.request_equipment_items (request_id, type_id, action, asset_tag)
select (select id from onb), id, 'Issue', 'LT-77' from public.equipment_types where name = 'Laptop · macOS';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_hs_admin","role":"authenticated"}', true);
select public.transition_request(id, 'in_execution') from onb;
insert into public.execution_confirmations (request_id, executed_by, checks)
select id, 'user_hs_admin',
  '{"access_provisioned": true, "devices_enrolled": true, "security_controls": true}' from onb;
select public.sign_request(id, public.request_snapshot_preview(id)) from onb;
reset role;
create temporary table reviewed as select private.request_snapshot_data(id) as data from onb;
grant select on reviewed to authenticated;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_hs_abe","role":"authenticated"}', true);
select public.confirm_request(id, (select data from reviewed)) from onb;
reset role;

create temporary table held as
  select i.id, i.kind::text as kind from public.employee_access_inventory i
  join public.employees e on e.id = i.employee_id
  where e.work_email = 'hana.hs@example.test' and i.ended_at is null;
create temporary table t (label text, id uuid);
grant select on held to authenticated;
grant select, insert on t to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_hs_admin","role":"authenticated"}', true);
insert into t select 'change', public.ai_start_request('access_modification',
  (select id from public.employees where work_email = 'hana.hs@example.test'));
insert into t select 'other', public.ai_start_request('onboarding');

-- 1–3. Suggest ----------------------------------------------------------------------------------------
select is(public.suggest_request_values((select id from t where label = 'change'), jsonb_build_array(
    jsonb_build_object('kind', 'held', 'target', 'held:' || (select id from held where kind = 'application'),
      'value', jsonb_build_object('action', 'Modify', 'value', 'Workspace Owner'), 'reason', 'you said so'),
    jsonb_build_object('kind', 'held', 'target', 'held:' || (select id from held where kind = 'equipment'),
      'value', jsonb_build_object('action', 'Return')))),
  2, 'two changes to what Hana holds');
select throws_ok(format($$select public.suggest_request_values(%L, '[{"kind":"held","target":"held:%s","value":{"action":"Remove"}}]')$$,
    (select id from t where label = 'other'), (select id from held where kind = 'application')),
  '22023', null, 'only on an access change');
select throws_ok(format($$select public.suggest_request_values(%L, '[{"kind":"held","target":"held:%s","value":{"action":"Remove"}}]')$$,
    (select id from t where label = 'change'), gen_random_uuid()),
  '22023', null, 'only items the person holds');

-- 4–7. Accept: the access-change lines, linked to the held items ---------------------------------------
select lives_ok($$select public.accept_request_suggestion(id) from public.request_suggestions
                  where request_id = (select id from t where label = 'change') and status = 'pending'$$,
  'accepting both');
select is((select action || ' · ' || permission from public.request_access_items
           where request_id = (select id from t where label = 'change')
             and inventory_id = (select id from held where kind = 'application')),
  'Modify · Workspace Owner', 'Slack: a new role, linked to what she holds');
select is((select action from public.request_equipment_items
           where request_id = (select id from t where label = 'change')
             and inventory_id = (select id from held where kind = 'equipment')),
  'Return', 'the laptop: returned');
select ok((select bool_and(source = 'ai') from public.audit_events
           where entity_id = (select id::text from t where label = 'change')
             and action in ('request.access_changed', 'request.access_added',
                            'request.equipment_added', 'request.equipment_changed')),
  'audited as the assistant''s');

-- 8–9. The rules of an access change still apply ------------------------------------------------------
select is(public.suggest_request_values((select id from t where label = 'change'), jsonb_build_array(
    jsonb_build_object('kind', 'held', 'target', 'held:' || (select id from held where kind = 'application'),
      'value', jsonb_build_object('action', 'Modify', 'value', 'Regular Member')))),
  1, 'a "change" to the role she already has can be suggested');
select throws_ok($$select public.accept_request_suggestion(id) from public.request_suggestions
                   where request_id = (select id from t where label = 'change') and status = 'pending'$$,
  '23514', null, '… but accepting it is refused like typing it (a change must change something)');

select * from finish();
rollback;

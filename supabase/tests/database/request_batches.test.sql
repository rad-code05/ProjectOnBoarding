-- Batch requests (F17b-1): a person's own batch of joiners / leavers; Confirm
-- creates one draft per included row without problems — all or nothing —
-- with the values written through the same checked path as accepting a
-- suggestion; removal method and mailbox wait for execution. Read-only once
-- created; deleted after 7 days (the drafts stay).
-- Run: pnpm db:test
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

insert into public.app_users (clerk_user_id, email, first_name, last_name) values
  ('user_rb_admin', 'rb-admin@example.test', 'Ada', 'Admin'),
  ('user_rb_other', 'rb-other@example.test', 'Oli', 'Other'),
  ('user_rb_abe',   'rb-abe@example.test',   'Abe', 'Approver');
insert into public.user_roles (clerk_user_id, role) values
  ('user_rb_admin', 'admin'), ('user_rb_admin', 'requester'), ('user_rb_admin', 'it_operator'),
  ('user_rb_other', 'admin'), ('user_rb_other', 'requester'),
  ('user_rb_abe', 'approver');
insert into public.signature_assets (user_id, kind, source, typed_text) values
  ('user_rb_admin', 'initials', 'typed', 'AA'), ('user_rb_abe', 'initials', 'typed', 'AB');

-- Omar's closed onboarding (Slack) — for the batch of leavers.
insert into public.requests
  (created_by, first_name, last_name, work_email, job_title, department_id, country,
   manager_name, requestor_name, effective_date, office_id)
values ('user_rb_admin', 'Omar', 'Test', 'omar.rb@example.test', 'Analyst',
  (select id from public.departments where name = 'Sales'), 'AE', 'Mara Manager', 'Rita Requestor',
  date '2026-01-05', (select id from public.offices where name = 'Dubai'));
create temporary table onb as select id from public.requests where work_email = 'omar.rb@example.test';
grant select on onb to authenticated;
insert into public.request_access_items (request_id, app_id, action, permission)
select (select id from onb), id, 'Grant', 'Regular Member' from public.catalog_apps where name = 'Slack';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_rb_admin","role":"authenticated"}', true);
select public.transition_request(id, 'in_execution') from onb;
insert into public.execution_confirmations (request_id, executed_by, checks)
select id, 'user_rb_admin', '{"access_provisioned": true, "devices_enrolled": true, "security_controls": true}' from onb;
select public.sign_request(id, public.request_snapshot_preview(id)) from onb;
reset role;
create temporary table reviewed as select private.request_snapshot_data(id) as data from onb;
grant select on reviewed to authenticated;
-- An open onboarding that already uses a work email.
insert into public.requests (created_by, first_name, work_email)
values ('user_rb_admin', 'Taken', 'taken.rb@example.test');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_rb_abe","role":"authenticated"}', true);
select public.confirm_request(id, (select data from reviewed)) from onb;

-- What one joiner's draft gets (the grid's writes).
create temporary table w (email text, writes jsonb);
grant select on w to authenticated;
insert into w
select e, jsonb_build_array(
    jsonb_build_object('kind', 'field', 'target', 'first_name', 'value', initcap(split_part(e, '.', 1))),
    jsonb_build_object('kind', 'field', 'target', 'last_name', 'value', 'Batch'),
    jsonb_build_object('kind', 'field', 'target', 'work_email', 'value', e),
    jsonb_build_object('kind', 'field', 'target', 'job_title', 'value', 'Analyst'),
    jsonb_build_object('kind', 'field', 'target', 'department_id', 'value',
      (select id from public.departments where name = 'Engineering')),
    jsonb_build_object('kind', 'field', 'target', 'office_id', 'value',
      (select id from public.offices where name = 'Dubai')),
    jsonb_build_object('kind', 'field', 'target', 'effective_date', 'value', (current_date + 10)::text),
    jsonb_build_object('kind', 'access', 'target', 'app:' || (select id from public.catalog_apps where name = 'Slack'),
      'value', jsonb_build_object('action', 'Grant', 'permission', 'Regular Member')))
from unnest(array['nina.rb@example.test', 'ola.rb@example.test', 'pia.rb@example.test', 'quinn.rb@example.test']) e;

-- 1–3. Made by an admin; own only; approvers can't --------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"user_rb_admin","role":"authenticated"}', true);
create temporary table bat (id uuid);
grant select, insert on bat to authenticated;
with x as (
  insert into public.request_batches (type, title, source, file_name)
  values ('onboarding', 'joiners-november.xlsx', 'file', 'joiners-november.xlsx') returning id)
insert into bat select id from x;
insert into public.request_batch_rows (batch_id, position, included, data, writes, problems)
select (select id from bat), 1, true, '{"name":"Nina"}'::jsonb, (select writes from w where email like 'nina%'), '[]'::jsonb
union all
select (select id from bat), 2, true, '{"name":"Ola"}', (select writes from w where email like 'ola%'),
  '[{"field":"department","message":"Not a department"}]'::jsonb
union all
select (select id from bat), 3, false, '{"name":"Pia"}', (select writes from w where email like 'pia%'), '[]'
union all
select (select id from bat), 4, true, '{"name":"Quinn"}', (select writes from w where email like 'quinn%'), '[]';
reset role;
select is((select count(*)::int from public.audit_events
           where action = 'batch.made' and entity_id = (select id::text from bat)), 1, 'audited: batch made');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_rb_other","role":"authenticated"}', true);
select is((select count(*)::int from public.request_batches where id = (select id from bat)), 0,
  'another admin doesn''t see it');
select set_config('request.jwt.claims', '{"sub":"user_rb_abe","role":"authenticated"}', true);
select throws_ok($$insert into public.request_batches (type, title, source) values ('onboarding', 'x', 'paste')$$,
  '42501', null, 'an approver can''t make a batch');

-- 4–5. Only Confirm creates ------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"user_rb_admin","role":"authenticated"}', true);
select throws_ok($$update public.request_batches set status = 'created' where id = (select id from bat)$$,
  '42501', null, 'a batch is created only by Confirm');
select throws_ok($$update public.request_batch_rows set request_id = (select id from onb)
                   where batch_id = (select id from bat) and position = 1$$,
  '42501', null, 'a row gets its draft only by Confirm');

-- 6–9. Checked again at Confirm — all or nothing ------------------------------------------------------------
create temporary table before_count as select count(*)::int as n from public.requests;
grant select on before_count to authenticated;
update public.request_batch_rows
   set writes = jsonb_set(writes, '{6,value}', '"2020-01-01"')
 where batch_id = (select id from bat) and position = 4;
select throws_ok($$select public.create_batch_drafts((select id from bat))$$,
  '22023', null, 'a start date in the past');
select is((select count(*)::int from public.requests), (select n from before_count),
  'nothing was created (Nina neither)');
update public.request_batch_rows
   set writes = (select writes from w where email like 'nina%')
 where batch_id = (select id from bat) and position = 4;
select throws_ok($$select public.create_batch_drafts((select id from bat))$$,
  '23505', null, 'the same work email twice in the batch');
update public.request_batch_rows
   set writes = jsonb_set((select writes from w where email like 'quinn%'), '{2,value}', '"taken.rb@example.test"')
 where batch_id = (select id from bat) and position = 4;
select throws_ok($$select public.create_batch_drafts((select id from bat))$$,
  '23505', null, 'a work email with an open request');
update public.request_batch_rows
   set writes = (select writes from w where email like 'quinn%')
 where batch_id = (select id from bat) and position = 4;

-- 10–16. Confirm --------------------------------------------------------------------------------------------
create temporary table made (result jsonb);
grant select, insert on made to authenticated;
insert into made select public.create_batch_drafts((select id from bat));
select is((select jsonb_array_length(result) from made), 2, 'two drafts: Nina and Quinn (Ola needs attention, Pia left out)');
select is((select string_agg(x ->> 'position', ',') from made, jsonb_array_elements(result) x), '1,4',
  'rows 1 and 4');
select is((select row(r.state::text, r.job_title, r.work_email, r.effective_date)::text
           from public.requests r where r.work_email = 'nina.rb@example.test'),
  row('draft', 'Analyst', 'nina.rb@example.test', current_date + 10)::text,
  'Nina''s draft has the values, written straight away');
select is((select count(*)::int from public.request_access_items a
           join public.requests r on r.id = a.request_id
           where r.work_email = 'quinn.rb@example.test' and a.permission = 'Regular Member'), 1,
  'Quinn: Slack · Regular Member');
select is((select count(*)::int from public.request_suggestions s
           join public.requests r on r.id = s.request_id
           where r.work_email in ('nina.rb@example.test', 'quinn.rb@example.test') and s.status = 'pending'), 0,
  'nothing left to accept');
select is((select status from public.request_batches where id = (select id from bat)), 'created', 'the batch is created');
select is((select count(*)::int from public.request_batch_rows
           where batch_id = (select id from bat) and request_id is not null), 2, 'rows link their drafts');

-- 17–19. Read-only after Confirm; audited as the assistant's -----------------------------------------------
select throws_ok($$update public.request_batch_rows set included = true where batch_id = (select id from bat)$$,
  '42501', null, 'rows can''t change any more');
select throws_ok($$select public.create_batch_drafts((select id from bat))$$,
  '22023', null, 'Confirm only once');
reset role;
select ok((select bool_and(source = 'ai') from public.audit_events
           where action = 'batch.created' and entity_id = (select id::text from bat)
             and (diff ->> 'created')::int = 2 and (diff ->> 'left_out')::int = 2),
  'audited: 2 created, 2 left out, source ai');

-- 20–21. Leavers: the person's removals pre-filled; method and mailbox wait --------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_rb_admin","role":"authenticated"}', true);
create temporary table bat2 (id uuid);
grant select, insert on bat2 to authenticated;
with x as (
  insert into public.request_batches (type, title, source, settings)
  values ('offboarding', 'Leavers', 'paste', '{"sla_timeline":"same_day"}') returning id)
insert into bat2 select id from x;
insert into public.request_batch_rows (batch_id, position, employee_id, writes)
select (select id from bat2), 1, (select id from public.employees where work_email = 'omar.rb@example.test'),
  jsonb_build_array(
    jsonb_build_object('kind', 'field', 'target', 'last_working_day', 'value', (current_date + 2)::text),
    jsonb_build_object('kind', 'field', 'target', 'handover_to', 'value', 'Rafiq Ahmed'),
    jsonb_build_object('kind', 'removal_all', 'value', jsonb_build_object('method', 'Suspend')),
    jsonb_build_object('kind', 'mailbox', 'target', 'mailbox', 'value', 'converted_shared'));
create temporary table off_made (result jsonb);
grant select, insert on off_made to authenticated;
insert into off_made select public.create_batch_drafts((select id from bat2));
select is((select row(r.type::text, r.handover_to)::text from public.requests r
           where r.id = (select (result -> 0 ->> 'request_id')::uuid from off_made)),
  row('offboarding', 'Rafiq Ahmed')::text, 'Omar''s offboarding with the handover');
select is((select string_agg(s.kind || '=' || coalesce(s.value ->> 'method', s.value #>> '{}'), ',' order by s.kind)
           from public.request_suggestions s
           where s.request_id = (select (result -> 0 ->> 'request_id')::uuid from off_made) and s.status = 'pending'),
  'mailbox=converted_shared,removal=Suspend', 'Slack''s method and the mailbox wait for execution');

-- 22–25. Discard and 7 days ----------------------------------------------------------------------------------
insert into public.request_batches (type, title, source) values ('onboarding', 'Throwaway', 'paste');
delete from public.request_batches where title = 'Throwaway';
reset role;
select is((select count(*)::int from public.audit_events where action = 'batch.discarded' and diff ->> 'title' = 'Throwaway'),
  1, 'audited: discarded');
-- Made 8 days ago (past the guard: a created batch never changes).
set local session_replication_role = replica;
update public.request_batches set created_at = now() - interval '8 days' where id = (select id from bat);
set local session_replication_role = origin;
select ok(private.purge_old_request_batches() >= 1, 'the daily clean-up deletes old batches');
select ok(not exists (select 1 from public.request_batches where id = (select id from bat))
          and exists (select 1 from public.requests where work_email = 'nina.rb@example.test'),
  'after 7 days the batch is gone; the drafts stay');
select is((select count(*)::int from cron.job where jobname = 'purge-old-request-batches'), 1,
  'the daily clean-up is scheduled');

select * from finish();
rollback;

-- Reports III (F14a): Offboarding SLA (deadline in the period, from Start
-- execution on; met / missed / open / overdue from the ticks), Access by
-- application (today, from the inventory; "Leaving" = an open offboarding the
-- caller may see) and Open requests by status (approvers: awaiting
-- confirmation and returned only). Run: pnpm db:test
begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

-- Fixtures (fake people only), inserted as the table owner.
insert into public.app_users (clerk_user_id, email, first_name, last_name) values
  ('user_r3_admin', 'r3-admin@example.test', 'Ada', 'Admin'),
  ('user_r3_abe',   'r3-abe@example.test',   'Abe', 'Approver'),
  ('user_r3_ivan',  'r3-ivan@example.test',  'Ivan', 'Operator');
insert into public.user_roles (clerk_user_id, role) values
  ('user_r3_admin', 'admin'), ('user_r3_admin', 'requester'), ('user_r3_admin', 'it_operator'),
  ('user_r3_abe', 'approver'),
  ('user_r3_ivan', 'it_operator');
insert into public.signature_assets (user_id, kind, source, typed_text) values
  ('user_r3_admin', 'initials', 'typed', 'AA'),
  ('user_r3_abe', 'initials', 'typed', 'AB');
insert into public.departments (name) values ('R3 Ops');
create temporary table dept as select id from public.departments where name = 'R3 Ops';
grant select on dept to authenticated;

create temporary table r (label text primary key, id uuid);
grant select, insert on r to authenticated;

-- Closed onboardings: Nina (Slack, Figma, office access), Max (GitHub),
-- Ola (Slack); a draft onboarding for Sam.
insert into public.requests
  (created_by, first_name, last_name, work_email, job_title, department_id, country,
   manager_name, requestor_name, effective_date)
select 'user_r3_admin', x.first, 'Test', x.email, 'Analyst', (select id from dept), x.country,
  'Mara Manager', 'Rita Requestor', date '2026-01-05'
from (values ('A', 'Nina', 'nina.r3@example.test', 'IT'), ('B', 'Max', 'max.r3@example.test', 'IS'),
             ('C', 'Ola', 'ola.r3@example.test', 'IT'), ('D', 'Sam', 'sam.r3@example.test', 'IT'))
  as x (label, first, email, country);
insert into r
select x.label, q.id from (
  select id, row_number() over (order by ticket_number) as n from public.requests
  where work_email like '%.r3@example.test') q
join (values (1, 'A'), (2, 'B'), (3, 'C'), (4, 'D')) as x (n, label) using (n);

insert into public.request_access_items (request_id, app_id, action, permission)
select (select id from r where label = x.label), a.id, 'Grant', x.permission
from (values ('A', 'Slack', 'Regular Member'), ('A', 'Figma', 'Dev'),
             ('B', 'GitHub', 'Admin'), ('C', 'Slack', 'Regular Member')) as x (label, app, permission)
join public.catalog_apps a on a.name = x.app;
insert into public.request_physical_access_items (request_id, type_id, action, scope)
select (select id from r where label = 'A'), id, 'Grant', 'Badge' from public.physical_access_types where name = 'Office access';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_r3_admin","role":"authenticated"}', true);
select public.transition_request(id, 'in_execution') from r where label in ('A', 'B', 'C');
insert into public.execution_confirmations (request_id, executed_by, checks)
select id, 'user_r3_admin', '{"access_provisioned": true, "devices_enrolled": true, "security_controls": true}'
from r where label in ('A', 'B', 'C');
select public.sign_request(id, public.request_snapshot_preview(id)) from r where label in ('A', 'B', 'C');
reset role;
create temporary table reviewed as select label, private.request_snapshot_data(id) as data from r where label in ('A', 'B', 'C');
grant select on reviewed to authenticated;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_r3_abe","role":"authenticated"}', true);
select public.confirm_request(r.id, v.data) from r join reviewed v using (label);

-- Offboardings: Nina (N, deadline ahead), Max (M, deadline passed), Ola (O,
-- started then cancelled), someone not in the app (E, still a draft).
select set_config('request.jwt.claims', '{"sub":"user_r3_admin","role":"authenticated"}', true);
insert into r select 'N', public.create_offboarding((select id from public.employees where work_email = 'nina.r3@example.test'));
insert into r select 'M', public.create_offboarding((select id from public.employees where work_email = 'max.r3@example.test'));
insert into r select 'O', public.create_offboarding((select id from public.employees where work_email = 'ola.r3@example.test'));
insert into r select 'E', public.create_offboarding(null);
update public.requests
set sla_timeline = 'within_24h', access_cutoff_at = now() - interval '1 hour', last_working_day = current_date,
    effective_date = current_date
where id in (select id from r where label in ('N', 'O'));
update public.requests
set sla_timeline = 'same_day', access_cutoff_at = now() - interval '3 days', last_working_day = current_date - 3,
    effective_date = current_date - 3
where id = (select id from r where label = 'M');
select public.transition_request(id, 'in_execution') from r where label in ('N', 'M', 'O');
select public.transition_request((select id from r where label = 'O'), 'cancelled', 'stays after all');
select public.set_removal('application', a.id, true, 'Delete')
from public.request_access_items a where a.request_id = (select id from r where label = 'N') and a.app_name = 'Slack';

-- 1–5. Who may read ----------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"user_r3_ivan","role":"authenticated"}', true);
select throws_ok($$select * from public.report_offboarding_sla()$$, '42501', null,
  'an IT operator without admin is not a report reader');
select throws_ok($$select * from public.report_offboarding_sla_summary()$$, '42501', null, 'nor for the SLA summary');
select throws_ok($$select * from public.report_access_by_item()$$, '42501', null, 'nor for access by application');
select throws_ok($$select * from public.report_access_holders()$$, '42501', null, 'nor for the holders');
select throws_ok($$select * from public.report_open_requests()$$, '42501', null, 'nor for open requests');

-- 6–11. Offboarding SLA ----------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"user_r3_admin","role":"authenticated"}', true);
select is((select array_agg(row(first_name, result, removals_done, removals_total)::text order by first_name)
           from public.report_offboarding_sla(p_search => 'r3@example')),
  array['(Max,overdue,0,1)', '(Nina,open,1,3)'],
  'started offboardings only (not the cancelled one or the draft); open before the deadline, overdue after');
select is((select row(met, missed, open, overdue)::text from public.report_offboarding_sla_summary(p_search => 'r3@example')
           where sla_timeline = 'same_day'),
  row(0, 0, 0, 1)::text, 'summary per timeline: Max (same day) is overdue');
select is((select count(*)::int from public.report_offboarding_sla(now() + interval '3 days', p_search => 'r3@example')),
  0, 'deadline before the period = not listed');
select is((select count(*)::int from public.report_offboarding_sla(now() - interval '1 day', now() + interval '1 day', p_search => 'r3@example')),
  1, 'the period is about the deadline (only Nina''s falls in this one)');

select public.set_removal('application', a.id, true, 'Delete')
from public.request_access_items a where a.request_id = (select id from r where label = 'M');
select public.set_removal('application', a.id, true, 'Suspend')
from public.request_access_items a where a.request_id = (select id from r where label = 'N') and a.done_at is null;
select public.set_removal('access', p.id, true)
from public.request_physical_access_items p where p.request_id = (select id from r where label = 'N');
update public.requests set sla_missed_reason = 'Owner rights needed the org admin' where id = (select id from r where label = 'M');

select is((select array_agg(row(first_name, result, removed_at is not null, sla_missed_reason)::text order by first_name)
           from public.report_offboarding_sla(p_search => 'r3@example')),
  array['(Max,missed,t,"Owner rights needed the org admin")', '(Nina,met,t,)'],
  'every removal ticked: met before the deadline, missed after (with the reason)');
select is((select sum(met + missed)::int from public.report_offboarding_sla_summary(p_search => 'r3@example')),
  2, 'summary: two decided');

-- 12–19. Access by application ----------------------------------------------------------------
select is((select array_agg(row(name, holders)::text order by holders desc, name)
           from public.report_access_by_item('application', (select id from dept))),
  array['(Slack,2)', '(Figma,1)', '(GitHub,1)'],
  'people per application today, most first (one department = only these people)');
select is((select row(total_people, total_rights, items_in_use, leaving_people)::text
           from public.report_access_by_item('application', (select id from dept)) limit 1),
  row(3, 4, 3, 2)::text, 'totals: 3 people, 4 rights, 3 applications, 2 leaving (Ola''s offboarding was cancelled)');
select is((select catalog_count from public.report_access_by_item('application', (select id from dept)) limit 1),
  (select count(*) from public.catalog_apps where active), 'applications in the catalog');
select is((select array_agg(name) from public.report_access_by_item('access', (select id from dept))),
  array['Office access'], 'the Access tab lists access types');
select is((select array_agg(row(first_name, permission, granted_ticket_id is not null,
                                coalesce(leaving_ticket_id = (select ticket_id from public.requests where id = (select id from r where label = 'N')), false))::text
                            order by first_name)
           from public.report_access_holders('application',
             (select 'app:' || id from public.catalog_apps where name = 'Slack'), (select id from dept))),
  array['(Nina,"Regular Member",t,t)', '(Ola,"Regular Member",t,f)'],
  'Slack holders with permission, the granting request and "Leaving"');
select is((select permission_counts from public.report_access_holders('application',
             (select 'app:' || id from public.catalog_apps where name = 'Slack'), (select id from dept)) limit 1),
  '{"Regular Member": 2}'::jsonb, 'count per permission');
select is((select count(*)::int from public.report_access_holders('application', null, (select id from dept), p_limit => 100)),
  4, 'no item = every held application row (full CSV)');
select is((select count(*)::int from public.report_access_holders('application', null, (select id from dept), p_search => 'max.r3')),
  1, 'search by person');

-- 20–24. Open requests by status ----------------------------------------------------------------
-- Sam's draft has waited 5 days (everything else in this transaction is "now").
reset role;
alter table public.requests disable trigger user;
update public.requests set created_at = now() - interval '5 days' where id = (select id from r where label = 'D');
alter table public.requests enable trigger user;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_r3_admin","role":"authenticated"}', true);
select is((select array_agg(row(first_name, state::text, sla_result)::text order by first_name)
           from public.report_open_requests(p_search => 'r3@example')),
  array['(Max,in_execution,missed)', '(Nina,in_execution,met)', '(Sam,draft,)'],
  'open requests (not closed or cancelled) with the offboarding SLA');
select ok((select bool_and(waiting_since is not null and waiting_since <= now())
           from public.report_open_requests(p_search => 'r3@example')), 'each has the time it reached its status');
select is((select array_agg(first_name order by first_name) from public.report_open_requests('offboarding', 'r3@example')),
  array['Max', 'Nina'], 'filter by type');
select is((select total_count from public.report_open_requests(p_search => 'r3@example') limit 1),
  3::bigint, 'total count');
select is((select first_name from public.report_open_requests(p_search => 'r3@example') limit 1),
  'Sam', 'longest waiting first');

-- 25–27. Approvers ------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"user_r3_abe","role":"authenticated"}', true);
select is((select count(*)::int from public.report_open_requests(p_search => 'r3@example')),
  0, 'an approver does not see drafts or work in progress');
select is((select count(*)::int from public.report_offboarding_sla(p_search => 'r3@example')),
  0, 'nor offboardings still in execution in the SLA report');
select is((select row(total_people, leaving_people)::text
           from public.report_access_by_item('application', (select id from dept)) limit 1),
  row(3, 0)::text, 'an approver reads access by application; offboardings in execution are not shown as Leaving');

select * from finish();
rollback;

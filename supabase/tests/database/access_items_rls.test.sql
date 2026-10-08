-- Application catalog and request access rows (F02a).
-- Run: pnpm db:test   (needs the local database: pnpm db:start)
begin;
create extension if not exists pgtap with schema extensions;
select plan(23);

-- Fixtures (fake people only), inserted as the table owner.
insert into public.app_users (clerk_user_id, email, first_name, last_name) values
  ('user_ax_admin',    'ax-admin@example.test',    'Ada', 'Admin'),
  ('user_ax_approver', 'ax-approver@example.test', 'Abe', 'Approver'),
  ('user_ax_auditor',  'ax-auditor@example.test',  'Aud', 'Itor'),
  ('user_ax_norole',   'ax-norole@example.test',   'No',  'Role');
insert into public.user_roles (clerk_user_id, role) values
  ('user_ax_admin', 'admin'), ('user_ax_admin', 'requester'), ('user_ax_admin', 'it_operator'),
  ('user_ax_approver', 'approver'),
  ('user_ax_auditor', 'auditor');

insert into public.requests (created_by, first_name) values ('user_ax_admin', 'Dora');
insert into public.requests (created_by, first_name, state) values ('user_ax_admin', 'Pia', 'pending_confirmation');
insert into public.request_access_items (request_id, app_id, action, permission)
select r.id, a.id, 'Grant', 'Member'
from public.requests r, public.catalog_apps a
where r.first_name = 'Pia' and a.name = 'Slack';

-- A retired app for the "can't add retired apps" check.
insert into public.catalog_apps (category_id, name, actions, permissions, active)
select id, 'Old Tool', '{Grant}', '{User}', false from public.catalog_categories where name = 'Core business';

-- ---------------------------------------------------------------------------
-- Catalog seed (form v4, PROJECT_PLAN §4.2)
-- ---------------------------------------------------------------------------
select results_eq(
  $$select name from public.catalog_categories order by sort_order$$,
  array['Core business', 'Engineering, cloud & data', 'Security, device & identity', 'Business, finance & operations'],
  'the four categories are seeded in order');
select is(
  (select count(*)::int from public.catalog_apps where active), 26,
  'the 26 applications of form v4 are seeded');
select is(
  (select actions from public.catalog_apps where name = 'Hexnode (MDM)'), array['Enroll', 'Remove'],
  'Hexnode has its own actions: Enroll / Remove');
select is(
  (select permissions from public.catalog_apps where name = 'Figma'), array['Viewer', 'Editor', 'Admin'],
  'each app has its own permission options (Figma: Viewer / Editor / Admin)');

-- ---------------------------------------------------------------------------
-- Admin / IT side on a draft
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_ax_admin","role":"authenticated"}', true);

select lives_ok(
  $$insert into public.request_access_items (request_id, app_id, action, permission, app_name, category_name)
    select r.id, a.id, 'Grant', 'Editor', 'Fake name', 'Fake category'
    from public.requests r, public.catalog_apps a where r.first_name = 'Dora' and a.name = 'Figma'$$,
  'Raju gives Figma (Grant · Editor) on a draft');
select ok(
  exists (select 1 from public.request_access_items
          where app_name = 'Figma' and category_name = 'Core business'),
  'the row keeps a copy of the catalog name and category (supplied values ignored)');
select throws_ok(
  $$insert into public.request_access_items (request_id, app_id, action)
    select r.id, a.id, 'Grant' from public.requests r, public.catalog_apps a
    where r.first_name = 'Dora' and a.name = 'Hexnode (MDM)'$$,
  '23514', null, 'an action the app does not offer is refused (Hexnode has no Grant)');
select throws_ok(
  $$insert into public.request_access_items (request_id, app_id, action, permission)
    select r.id, a.id, 'Grant', 'Owner' from public.requests r, public.catalog_apps a
    where r.first_name = 'Dora' and a.name = 'Slack'$$,
  '23514', null, 'a permission the app does not offer is refused');
select throws_ok(
  $$insert into public.request_access_items (request_id, app_id, action, permission)
    select r.id, a.id, 'Modify', 'Admin' from public.requests r, public.catalog_apps a
    where r.first_name = 'Dora' and a.name = 'Figma'$$,
  '23505', null, 'an app appears only once per request');
select throws_ok(
  $$insert into public.request_access_items (request_id, app_id, action)
    select r.id, a.id, 'Grant' from public.requests r, public.catalog_apps a
    where r.first_name = 'Dora' and a.name = 'Old Tool'$$,
  '23514', null, 'a retired app cannot be added');
select lives_ok(
  $$insert into public.request_access_items (request_id, app_name, action, permission)
    select id, '  Notion ', 'Grant', 'Member' from public.requests where first_name = 'Dora'$$,
  'an "Other" application can be typed on the request');
select ok(
  exists (select 1 from public.request_access_items where app_name = 'Notion' and category_name = 'Other' and app_id is null),
  'other applications are stored under "Other", name trimmed');
select throws_ok(
  $$insert into public.request_access_items (request_id, app_name, action)
    select id, 'Notion2', 'Enroll' from public.requests where first_name = 'Dora'$$,
  '23514', null, 'other applications take Grant / Modify / Remove only');

update public.request_access_items set permission = 'Admin' where app_name = 'Figma';
select ok(
  exists (select 1 from public.audit_events
          where action = 'request.access_changed'
            and diff -> 'before' ->> 'permission' = 'Editor'
            and diff -> 'after' ->> 'permission' = 'Admin'),
  'a change is audited (before → after)');
delete from public.request_access_items where app_name = 'Notion';
select ok(
  exists (select 1 from public.audit_events where action = 'request.access_removed' and diff ->> 'app' = 'Notion'),
  'removing an app ("Clear") is audited');
select ok(
  exists (select 1 from public.audit_events where action = 'request.access_added' and diff ->> 'app' = 'Figma'),
  'adding an app is audited');
select throws_ok(
  $$update public.request_access_items set app_id = (select id from public.catalog_apps where name = 'Slack')
    where app_name = 'Figma'$$,
  '42501', null, 'the app of a row cannot be swapped');
select throws_ok(
  $$insert into public.request_access_items (request_id, app_id, action)
    select r.id, a.id, 'Grant' from public.requests r, public.catalog_apps a
    where r.first_name = 'Pia' and a.name = 'Figma'$$,
  '42501', null, 'apps cannot be added once the request awaits confirmation');

-- ---------------------------------------------------------------------------
-- Approver, auditor, no role
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"user_ax_approver","role":"authenticated"}', true);
select results_eq(
  $$select app_name from public.request_access_items$$, array['Slack'],
  'the approver sees only the apps of the request awaiting confirmation — no drafts');
select throws_ok(
  $$insert into public.request_access_items (request_id, app_name, action)
    select id, 'X', 'Grant' from public.requests$$,
  '42501', null, 'an approver cannot add apps');

select set_config('request.jwt.claims', '{"sub":"user_ax_auditor","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.request_access_items), 2, 'the auditor reads all app rows');

select set_config('request.jwt.claims', '{"sub":"user_ax_norole","role":"authenticated"}', true);
select is_empty($$select * from public.request_access_items$$, 'a user without a role sees no app rows');

select set_config('request.jwt.claims', '{"sub":"user_ax_nobody","role":"authenticated"}', true);
select is_empty($$select * from public.catalog_apps$$, 'someone without an account sees no catalog');

select * from finish();
rollback;

-- Several roles in one application row (2026-10-14): an app marked
-- multi_permission (Google Cloud) accepts "A; B" from its own options, stored
-- in catalog order; other apps still take one option. Run: pnpm db:test
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into public.app_users (clerk_user_id, email, first_name, last_name) values
  ('user_mr_admin', 'mr-admin@example.test', 'Ada', 'Admin');
insert into public.user_roles (clerk_user_id, role) values
  ('user_mr_admin', 'admin'), ('user_mr_admin', 'requester'), ('user_mr_admin', 'it_operator');
insert into public.requests (created_by, first_name) values ('user_mr_admin', 'Mira');

select ok((select multi_permission from public.catalog_apps where name = 'Google Cloud'),
  'Google Cloud takes several roles');
select ok((select not multi_permission from public.catalog_apps where name = 'Slack'),
  'other apps take one role');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_mr_admin","role":"authenticated"}', true);

select lives_ok(
  $$insert into public.request_access_items (request_id, app_id, action, permission)
    select r.id, a.id, 'Grant', ' Cloud Run Admin ;Editor;  '
    from public.requests r, public.catalog_apps a where r.first_name = 'Mira' and a.name = 'Google Cloud'$$,
  'Raju gives Google Cloud two roles in one row');
select is(
  (select permission from public.request_access_items where app_name = 'Google Cloud'),
  'Editor; Cloud Run Admin',
  'the roles are tidied and stored in catalog order');
select throws_ok(
  $$update public.request_access_items set permission = 'Editor; Janitor' where app_name = 'Google Cloud'$$,
  '23514', 'permission Janitor is not offered for Google Cloud', 'a role the app does not offer is refused');
select throws_ok(
  $$update public.request_access_items set permission = 'Editor; Editor' where app_name = 'Google Cloud'$$,
  '23514', 'a role is listed twice for Google Cloud', 'a role cannot be listed twice');
select lives_ok(
  $$update public.request_access_items set permission = ' ; ' where app_name = 'Google Cloud'$$,
  'only separators = no role');
select is((select permission from public.request_access_items where app_name = 'Google Cloud'), null::text,
  '… stored as no permission');
select throws_ok(
  $$insert into public.request_access_items (request_id, app_id, action, permission)
    select r.id, a.id, 'Grant', 'Regular Member; Workspace Owner'
    from public.requests r, public.catalog_apps a where r.first_name = 'Mira' and a.name = 'Slack'$$,
  '23514', null, 'an app with one role refuses two');

-- Admin turns it on for another app; audited; ";" can't be inside an option.
select lives_ok(
  $$select public.admin_save_app((select id from public.catalog_apps where name = 'Supabase'),
      (select category_id from public.catalog_apps where name = 'Supabase'), 'Supabase',
      '{Grant,Modify,Remove}', '{Developer,Administrator,Owner}', true)$$,
  'an admin lets Supabase take several roles');
select ok(
  exists (select 1 from public.audit_events
          where action = 'catalog.app_changed'
            and diff -> 'before' ->> 'multi_permission' = 'false'
            and diff -> 'after' ->> 'multi_permission' = 'true'),
  'the change is audited (before → after)');
select throws_ok(
  $$select public.admin_save_app(null, (select id from public.catalog_categories where name = 'Core business'),
      'Linear', '{Grant}', '{"User; Admin"}', true)$$,
  '23514', 'a permission option cannot contain ";"', 'an option cannot contain the separator');

select * from finish();
rollback;

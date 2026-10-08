-- Equipment (section 6) and physical & logical access (section 7) — F03a.
-- Run: pnpm db:test   (needs the local database: pnpm db:start)
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

-- Fixtures (fake people only), inserted as the table owner.
insert into public.app_users (clerk_user_id, email, first_name, last_name) values
  ('user_eq_admin',    'eq-admin@example.test',    'Ada', 'Admin'),
  ('user_eq_approver', 'eq-approver@example.test', 'Abe', 'Approver'),
  ('user_eq_norole',   'eq-norole@example.test',   'No',  'Role');
insert into public.user_roles (clerk_user_id, role) values
  ('user_eq_admin', 'admin'), ('user_eq_admin', 'requester'), ('user_eq_admin', 'it_operator'),
  ('user_eq_approver', 'approver');

insert into public.requests (created_by, first_name) values ('user_eq_admin', 'Dora');
insert into public.requests (created_by, first_name, state) values ('user_eq_admin', 'Pia', 'pending_confirmation');
insert into public.request_equipment_items (request_id, type_id, action, asset_tag)
select r.id, t.id, 'Issue', 'LN-0001' from public.requests r, public.equipment_types t
where r.first_name = 'Pia' and t.name = 'Mobile phone';

-- ---------------------------------------------------------------------------
-- Seed (form v4)
-- ---------------------------------------------------------------------------
select results_eq(
  $$select name from public.equipment_types order by sort_order$$,
  array['Laptop · Windows', 'Laptop · macOS', 'Mobile phone', 'Other'],
  'the four equipment types are seeded in order');
select ok(
  (select needs_description from public.equipment_types where name = 'Other'),
  '"Other" equipment needs a description');
select results_eq(
  $$select name from public.physical_access_types order by sort_order$$,
  array['Office access', 'VPN / secure access', 'Shared drives'],
  'the three physical & logical access types are seeded');
select is(
  (select scopes from public.physical_access_types where name = 'Office access'), array['Badge', 'Key'],
  'office access has its own scopes: Badge / Key');

-- ---------------------------------------------------------------------------
-- IT side on a draft
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_eq_admin","role":"authenticated"}', true);

select lives_ok(
  $$insert into public.request_equipment_items (request_id, type_id, action, asset_tag, type_name)
    select r.id, t.id, 'Issue', ' LN-0042 ', 'Fake' from public.requests r, public.equipment_types t
    where r.first_name = 'Dora' and t.name = 'Laptop · macOS'$$,
  'Raju issues a macOS laptop on a draft');
select ok(
  exists (select 1 from public.request_equipment_items
          where type_name = 'Laptop · macOS' and asset_tag = 'LN-0042'),
  'the row keeps a copy of the type name (supplied value ignored), asset tag trimmed');
select lives_ok(
  $$insert into public.request_equipment_items (request_id, type_id, action)
    select r.id, t.id, 'Issue' from public.requests r, public.equipment_types t
    where r.first_name = 'Dora' and t.name = 'Laptop · macOS'$$,
  'several items of the same type are allowed (two laptops)');
select throws_ok(
  $$insert into public.request_equipment_items (request_id, type_id, action)
    select r.id, t.id, 'Grant' from public.requests r, public.equipment_types t
    where r.first_name = 'Dora' and t.name = 'Mobile phone'$$,
  '23514', null, 'equipment takes Issue / Return only');
select throws_ok(
  $$insert into public.request_equipment_items (request_id, type_id, action, description)
    select r.id, t.id, 'Issue', '  ' from public.requests r, public.equipment_types t
    where r.first_name = 'Dora' and t.name = 'Other'$$,
  '23514', null, '"Other" equipment without a description is refused');
select lives_ok(
  $$insert into public.request_equipment_items (request_id, type_id, action, description)
    select r.id, t.id, 'Issue', 'Monitor 27"' from public.requests r, public.equipment_types t
    where r.first_name = 'Dora' and t.name = 'Other'$$,
  '"Other" equipment with a description is accepted');

select lives_ok(
  $$insert into public.request_physical_access_items (request_id, type_id, action, scope)
    select r.id, t.id, 'Grant', 'Badge' from public.requests r, public.physical_access_types t
    where r.first_name = 'Dora' and t.name = 'Office access'$$,
  'Raju grants office access with a badge');
select throws_ok(
  $$insert into public.request_physical_access_items (request_id, type_id, action, scope)
    select r.id, t.id, 'Grant', 'Key' from public.requests r, public.physical_access_types t
    where r.first_name = 'Dora' and t.name = 'Office access'$$,
  '23505', null, 'each access type appears only once per request');
select throws_ok(
  $$insert into public.request_physical_access_items (request_id, type_id, action)
    select r.id, t.id, 'Modify' from public.requests r, public.physical_access_types t
    where r.first_name = 'Dora' and t.name = 'VPN / secure access'$$,
  '23514', null, 'an action the type does not offer is refused (VPN has no Modify)');
select throws_ok(
  $$insert into public.request_physical_access_items (request_id, type_id, action, scope)
    select r.id, t.id, 'Grant', 'Building' from public.requests r, public.physical_access_types t
    where r.first_name = 'Dora' and t.name = 'Shared drives'$$,
  '23514', null, 'a scope the type does not offer is refused');

update public.request_physical_access_items set scope = 'Key' where type_name = 'Office access';
select ok(
  exists (select 1 from public.audit_events
          where action = 'request.physical_changed'
            and diff -> 'before' ->> 'scope' = 'Badge' and diff -> 'after' ->> 'scope' = 'Key'),
  'a change in section 7 is audited (before → after)');
delete from public.request_equipment_items where description = 'Monitor 27"';
select ok(
  exists (select 1 from public.audit_events where action = 'request.equipment_removed' and diff ->> 'description' = 'Monitor 27"'),
  'removing equipment is audited');
select ok(
  exists (select 1 from public.audit_events where action = 'request.equipment_added' and diff ->> 'asset_tag' = 'LN-0042'),
  'adding equipment is audited');
select throws_ok(
  $$insert into public.request_equipment_items (request_id, type_id, action)
    select r.id, t.id, 'Issue' from public.requests r, public.equipment_types t
    where r.first_name = 'Pia' and t.name = 'Mobile phone'$$,
  '42501', null, 'equipment cannot be added once the request awaits confirmation');

-- ---------------------------------------------------------------------------
-- Approver and no role
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"user_eq_approver","role":"authenticated"}', true);
select results_eq(
  $$select asset_tag from public.request_equipment_items$$, array['LN-0001'],
  'the approver sees only the equipment of the request awaiting confirmation — no drafts');
select is_empty(
  $$select * from public.request_physical_access_items$$,
  'the approver sees no section 7 rows of drafts');
select throws_ok(
  $$insert into public.request_physical_access_items (request_id, type_id, action)
    select r.id, t.id, 'Grant' from public.requests r, public.physical_access_types t limit 1$$,
  '42501', null, 'an approver cannot add rows');

select set_config('request.jwt.claims', '{"sub":"user_eq_norole","role":"authenticated"}', true);
select is_empty($$select * from public.request_equipment_items$$, 'a user without a role sees no equipment');

select * from finish();
rollback;

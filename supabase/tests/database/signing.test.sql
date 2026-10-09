-- Review & sign (F06a): snapshot + SHA-256 (RFC 8785), signature with server
-- time, the checks, and confirmation only through signing.
-- Run: pnpm db:test   (needs the local database: pnpm db:start)
begin;
create extension if not exists pgtap with schema extensions;
select plan(35);

-- Fixtures (fake people only), inserted as the table owner.
insert into public.app_users (clerk_user_id, email, first_name, last_name) values
  ('user_sg_admin',    'sg-admin@example.test',    'Ada', 'Admin'),
  ('user_sg_req',      'sg-req@example.test',      'Rex', 'Requester'),
  ('user_sg_approver', 'sg-approver@example.test', 'Abe', 'Approver');
insert into public.user_roles (clerk_user_id, role) values
  ('user_sg_admin', 'admin'), ('user_sg_admin', 'requester'), ('user_sg_admin', 'it_operator'),
  ('user_sg_req', 'requester'),
  ('user_sg_approver', 'approver');

-- Anna: everything filled in. Ben: no job title.
insert into public.requests
  (created_by, first_name, last_name, work_email, job_title, department_id, country,
   manager_name, requestor_name, effective_date)
select 'user_sg_admin', 'Anna', 'Keller', 'anna.keller@example.test', 'Product Designer',
  (select id from public.departments where name = 'Engineering'), 'CH',
  'Mara Manager', 'Rita Requestor', date '2026-10-14';
insert into public.requests
  (created_by, first_name, last_name, work_email, department_id, country,
   manager_name, requestor_name, effective_date)
select 'user_sg_admin', 'Ben', 'Brun', 'ben.brun@example.test',
  (select id from public.departments where name = 'Engineering'), 'CH',
  'Mara Manager', 'Rita Requestor', date '2026-10-14';

create temporary table ids as
select first_name, id from public.requests where first_name in ('Anna', 'Ben');
grant select on ids to authenticated;

-- ---------------------------------------------------------------------------
-- Canonical form (RFC 8785) and fingerprint
-- ---------------------------------------------------------------------------
select is(private.canonical_json('{"b": 1, "a": [true, null, "x\"y"]}'),
  '{"a":[true,null,"x\"y"],"b":1}', 'keys sorted, no spaces, strings escaped');
select is(private.canonical_json(to_jsonb(E'é\n\u0001'::text)),
  E'"é\\n\\u0001"'::text, 'control characters escaped like JSON.stringify, other text kept');
select throws_ok($$select private.canonical_json('1.5')$$, '23514', null,
  'only whole numbers in snapshots');
select is(private.snapshot_sha256('{"b": 1, "a": [true, null, "x\"y"]}'),
  '13c255067dcb1a4607cf8f615caa4e985d773b15ab6bc957b8a2317c210b4acb',
  'SHA-256 of the canonical form (checked with Python)');

-- Shared example with lib/signing/fingerprint.test.ts: the `canonicalize`
-- library (RFC 8785 reference) gives this exact text and SHA-256.
select is(private.canonical_json($v${"request":{"first_name":"José","last_name":"Müller","ticket_id":"UAM-2026-000124","effective_date":"2026-10-14","custom_fields":{}},"access":[{"app":"Figma","action":"Grant","permission":"Editor","notes":null}],"execution":{"checks":{"devices_enrolled":true,"access_provisioned":true},"notes":"Laptop €1 \"MacBook\"\nVPN\tok\u0001"}}$v$::jsonb),
  $c${"access":[{"action":"Grant","app":"Figma","notes":null,"permission":"Editor"}],"execution":{"checks":{"access_provisioned":true,"devices_enrolled":true},"notes":"Laptop €1 \"MacBook\"\nVPN\tok\u0001"},"request":{"custom_fields":{},"effective_date":"2026-10-14","first_name":"José","last_name":"Müller","ticket_id":"UAM-2026-000124"}}$c$::text, 'same canonical text as the RFC 8785 library (accents, €, quotes, control characters)');
select is(private.snapshot_sha256($v${"request":{"first_name":"José","last_name":"Müller","ticket_id":"UAM-2026-000124","effective_date":"2026-10-14","custom_fields":{}},"access":[{"app":"Figma","action":"Grant","permission":"Editor","notes":null}],"execution":{"checks":{"devices_enrolled":true,"access_provisioned":true},"notes":"Laptop €1 \"MacBook\"\nVPN\tok\u0001"}}$v$::jsonb),
  '43779ef290cabb92960c7ca2dcd8c79ca4668468df98741457190d41ea06e239',
  'same SHA-256 as the RFC 8785 library');

-- ---------------------------------------------------------------------------
-- Getting Anna and Ben ready (IT side)
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_sg_admin","role":"authenticated"}', true);
select public.transition_request(id, 'in_execution') from ids;
insert into public.execution_confirmations (request_id, executed_by, checks, notes)
select id, 'user_sg_admin',
  '{"access_provisioned": true, "devices_enrolled": true, "security_controls": true}', 'Laptop shipped'
from ids;

select throws_ok(
  $$select public.transition_request((select id from ids where first_name = 'Anna'), 'pending_confirmation')$$,
  '42501', null, 'it cannot go for confirmation without signing');

select ok(
  (select (c ->> 'state_ok')::boolean and (c ->> 'checklist_complete')::boolean
     and c -> 'missing_fields' = '[]'::jsonb and c -> 'signature' = 'null'::jsonb
   from public.signing_checks((select id from ids where first_name = 'Anna')) as c),
  'checks: Anna is complete, but Ada has no signature yet');
select is(
  (select c -> 'missing_fields' from public.signing_checks((select id from ids where first_name = 'Ben')) as c),
  '["Job title / role"]'::jsonb, 'checks: Ben is missing his job title');

select throws_ok(
  $$select public.sign_request(id, public.request_snapshot_preview(id)) from ids where first_name = 'Anna'$$,
  '23514', 'add your signature or initials in My profile first', 'no signing without a signature on file');

-- Ada adds typed initials (My profile, F05).
insert into public.signature_assets (user_id, kind, source, typed_text)
values ('user_sg_admin', 'initials', 'typed', 'AA');

select throws_ok(
  $$select public.sign_request(id, public.request_snapshot_preview(id)) from ids where first_name = 'Ben'$$,
  '23514', 'required fields are empty: Job title / role', 'no signing with required fields empty');

-- The snapshot shown in the sheet
select ok(
  (select s -> 'request' ->> 'ticket_id' like 'UAM-%' and s -> 'request' ->> 'department' = 'Engineering'
     and s -> 'request' ->> 'form_version' = '4.1' and s -> 'execution' ->> 'executed_by_name' = 'Ada Admin'
     and s -> 'access' = '[]'::jsonb
   from public.request_snapshot_preview((select id from ids where first_name = 'Anna')) as s),
  'the preview holds the request, names and section 9');

-- Changed after review → refused.
create temporary table reviewed as
select public.request_snapshot_preview(id) as data from ids where first_name = 'Anna';
grant select on reviewed to authenticated;
update public.execution_confirmations set notes = 'Laptop shipped, VPN added'
where request_id = (select id from ids where first_name = 'Anna');
select throws_ok(
  $$select public.sign_request((select id from ids where first_name = 'Anna'), (select data from reviewed))$$,
  '40001', null, 'a change after review stops the signing ("review it again")');

-- ---------------------------------------------------------------------------
-- Other people cannot sign
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"user_sg_req","role":"authenticated"}', true);
select throws_ok(
  $$select public.sign_request(id, '{}') from ids where first_name = 'Anna'$$,
  '42501', null, 'a requester cannot sign section 9');
select throws_ok(
  $$select public.signing_checks(id) from ids where first_name = 'Anna'$$,
  '42501', null, 'a requester cannot run the signing checks');
select set_config('request.jwt.claims', '{"sub":"user_sg_approver","role":"authenticated"}', true);
select throws_ok(
  $$select public.sign_request(id, '{}') from ids where first_name = 'Anna'$$,
  '42501', null, 'an approver cannot sign section 9');
select throws_ok(
  $$select public.request_snapshot_preview(id) from ids where first_name = 'Anna'$$,
  '42501', null, 'an approver cannot read the signing preview');

-- ---------------------------------------------------------------------------
-- Ada signs Anna
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"user_sg_admin","role":"authenticated"}', true);
select lives_ok(
  $$select public.sign_request(id, public.request_snapshot_preview(id)) from ids where first_name = 'Anna'$$,
  'Ada signs with the snapshot she reviewed');

select is((select state from public.requests where first_name = 'Anna'),
  'pending_confirmation'::public.request_state, 'the request now awaits confirmation');
select ok(
  (select s.signer_id = 'user_sg_admin' and s.signer_role = 'it_operator' and s.section = 'it_execution'
     and s.signed_at > now() - interval '1 minute' and s.cleared_at is null
     and s.signature_asset_id = (select id from public.signature_assets where user_id = 'user_sg_admin' and is_active)
     and s.form_version_id = (select id from public.form_versions where version = '4.1')
   from public.signatures s where s.request_id = (select id from ids where first_name = 'Anna')),
  'the signature records signer, role, section, active asset, form version and server time');
select ok(
  exists (select 1 from public.audit_events where action = 'request.signed'
          and entity_id = (select id::text from ids where first_name = 'Anna')
          and diff ->> 'snapshot_sha256' ~ '^[0-9a-f]{64}$'),
  'signing is audited with the fingerprint');
select ok(
  exists (select 1 from public.audit_events where action = 'request.state_changed'
          and entity_id = (select id::text from ids where first_name = 'Anna')
          and diff ->> 'to' = 'pending_confirmation'),
  'the state change is audited too');

-- Locked and permanent
select is_empty(
  $$update public.requests set job_title = 'x' where first_name = 'Anna' returning 1$$,
  'sections 1–9 are locked after signing');
select is_empty(
  $$update public.execution_confirmations set notes = 'later'
    where request_id = (select id from ids where first_name = 'Anna') returning 1$$,
  'section 9 is locked after signing');
select throws_ok(
  $$select public.sign_request(id, public.request_snapshot_preview(id)) from ids where first_name = 'Anna'$$,
  '23514', null, 'a signed request cannot be signed again');
select throws_ok(
  $$insert into public.signatures (request_id, section, signer_id, signer_role, signature_asset_id, form_version_id, snapshot_id)
    select request_id, section, signer_id, signer_role, signature_asset_id, form_version_id, snapshot_id
    from public.signatures limit 1$$,
  '42501', null, 'nobody inserts a signature directly');
select throws_ok(
  $$update public.signatures set signed_at = '2000-01-01'$$,
  '42501', null, 'nobody edits a signature directly (no update right)');

reset role;
select ok(
  (select n.kind = 'it_signature' and n.sha256 = private.snapshot_sha256(n.data)
     and n.data -> 'execution' ->> 'notes' = 'Laptop shipped, VPN added'
   from public.request_snapshots n where n.request_id = (select id from ids where first_name = 'Anna')),
  'the frozen snapshot holds what was signed, with its SHA-256');
select throws_ok(
  $$update public.signatures set signed_at = '2000-01-01'$$,
  '42501', null, 'not even the owner backdates a signature');
select throws_ok(
  $$delete from public.signatures$$, '42501', null, 'signatures are never deleted');
select throws_ok(
  $$update public.request_snapshots set data = '{}'$$, '42501', null, 'snapshots are never edited');

-- ---------------------------------------------------------------------------
-- Visibility, and signing again after a return
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_sg_approver","role":"authenticated"}', true);
select is((select count(*)::int from public.signatures s join ids on ids.id = s.request_id), 1,
  'the approver sees the IT signature of a request awaiting confirmation');
select public.transition_request(id, 'returned', 'Add the VPN group') from ids where first_name = 'Anna';

select set_config('request.jwt.claims', '{"sub":"user_sg_admin","role":"authenticated"}', true);
select lives_ok(
  $$select public.sign_request(id, public.request_snapshot_preview(id)) from ids where first_name = 'Anna'$$,
  'after a return Ada signs again');
select is(
  (select count(*)::int from public.signatures
   where request_id = (select id from ids where first_name = 'Anna') and cleared_at is not null),
  1, 'the earlier signature is cleared, not deleted');
select is(
  (select count(*)::int from public.signatures
   where request_id = (select id from ids where first_name = 'Anna') and cleared_at is null),
  1, 'exactly one current IT signature');

select * from finish();
rollback;

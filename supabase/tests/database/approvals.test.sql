-- Approvals (F07a): confirm & sign, return to Raju, Raju's note, who may do
-- what, and signature images visible where they were applied.
-- Run: pnpm db:test   (needs the local database: pnpm db:start)
begin;
create extension if not exists pgtap with schema extensions;
select plan(36);

-- Fixtures (fake people only), inserted as the table owner.
insert into public.app_users (clerk_user_id, email, first_name, last_name) values
  ('user_ap_admin', 'ap-admin@example.test', 'Ada',  'Admin'),
  ('user_ap_abe',   'ap-abe@example.test',   'Abe',  'Approver'),
  ('user_ap_bea',   'ap-bea@example.test',   'Bea',  'Backup'),
  ('user_ap_cleo',  'ap-cleo@example.test',  'Cleo', 'Creator');
insert into public.user_roles (clerk_user_id, role) values
  ('user_ap_admin', 'admin'), ('user_ap_admin', 'requester'), ('user_ap_admin', 'it_operator'),
  ('user_ap_abe', 'approver'),
  ('user_ap_bea', 'approver'),
  -- Creates a request AND approves: must never confirm her own.
  ('user_ap_cleo', 'requester'), ('user_ap_cleo', 'approver');

-- Anna and Ben: by Ada. Owen: by Cleo.
insert into public.requests
  (created_by, first_name, last_name, work_email, job_title, department_id, country,
   manager_name, requestor_name, effective_date)
select c, f, 'Test', lower(f) || '.test@example.test', 'Analyst',
  (select id from public.departments where name = 'Engineering'), 'CH',
  'Mara Manager', 'Rita Requestor', date '2026-10-14'
from (values ('user_ap_admin', 'Anna'), ('user_ap_admin', 'Ben'), ('user_ap_cleo', 'Owen')) as v (c, f);

create temporary table ids as
select first_name, id from public.requests where first_name in ('Anna', 'Ben', 'Owen');
grant select on ids to authenticated;

-- Signatures on file: Ada has a PNG, Abe typed initials, Bea nothing yet.
insert into public.signature_assets (user_id, kind, source, storage_path, width, height, byte_size, sha256)
values ('user_ap_admin', 'signature', 'png', 'user_ap_admin/sig.png', 640, 200, 1000, repeat('a', 64));
insert into public.signature_assets (user_id, kind, source, typed_text)
values ('user_ap_abe', 'initials', 'typed', 'AB');

-- Ada executes all three and signs Anna and Owen.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_ap_admin","role":"authenticated"}', true);
select public.transition_request(id, 'in_execution') from ids;
insert into public.execution_confirmations (request_id, executed_by, checks)
select id, 'user_ap_admin',
  '{"access_provisioned": true, "devices_enrolled": true, "security_controls": true}' from ids;

select throws_ok(
  $$select public.sign_request(id, public.request_snapshot_preview(id), 'Fixed it') from ids where first_name = 'Ben'$$,
  '23514', 'a note for the approver is only for a returned request',
  'a note for the approver only when signing again after a return');
select public.sign_request(id, public.request_snapshot_preview(id)) from ids where first_name in ('Anna', 'Owen');

-- ---------------------------------------------------------------------------
-- Only through Confirm & sign / Return
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"user_ap_abe","role":"authenticated"}', true);
select throws_ok(
  $$select public.transition_request((select id from ids where first_name = 'Anna'), 'closed')$$,
  '42501', null, 'closing only through Confirm & sign');
select throws_ok(
  $$select public.transition_request((select id from ids where first_name = 'Anna'), 'returned', 'x')$$,
  '42501', null, 'returning only through Return to Raju');

-- What the approver sees of Raju's signature
select ok(
  (select signer_name = 'Ada Admin' and section = 'it_execution' and source = 'png'
     and storage_path = 'user_ap_admin/sig.png' and sha256 ~ '^[0-9a-f]{64}$'
   from public.request_signature_marks((select id from ids where first_name = 'Anna'))),
  'the approver sees the IT signature that was applied, with its fingerprint');
select ok(private.signature_file_visible('user_ap_admin/sig.png'),
  'the applied signature image may be read by the approver');
select ok(not private.signature_file_visible('user_ap_admin/other.png'),
  'other images of the signer stay private');
select is_empty(
  $$select 1 from public.signature_assets where user_id = 'user_ap_admin'$$,
  'the signer''s signature versions themselves stay private (My profile)');

-- ---------------------------------------------------------------------------
-- Who may confirm
-- ---------------------------------------------------------------------------
select ok(
  public.approval_preview((select id from ids where first_name = 'Anna')) ->> 'request' is not null,
  'the approver reads the snapshot he is asked to confirm');
select throws_ok(
  $$select public.confirm_request(id, '{}') from ids where first_name = 'Anna'$$,
  '40001', null, 'a snapshot that differs from the request is refused');

select set_config('request.jwt.claims', '{"sub":"user_ap_bea","role":"authenticated"}', true);
select throws_ok(
  $$select public.confirm_request(id, public.request_snapshot_preview(id)) from ids where first_name = 'Anna'$$,
  '42501', null, 'an approver cannot use the IT signing preview');

-- Approvers build the reviewed snapshot from what they can read; here as owner.
reset role;
create temporary table reviewed as
select first_name, private.request_snapshot_data(id) as data from ids;
grant select on reviewed to authenticated;
set local role authenticated;

select set_config('request.jwt.claims', '{"sub":"user_ap_bea","role":"authenticated"}', true);
select throws_ok(
  $$select public.confirm_request(id, (select data from reviewed where first_name = 'Anna')) from ids where first_name = 'Anna'$$,
  '23514', 'add your signature or initials in My profile first', 'no confirming without a signature on file');

select set_config('request.jwt.claims', '{"sub":"user_ap_cleo","role":"authenticated"}', true);
select throws_ok(
  $$select public.confirm_request(id, (select data from reviewed where first_name = 'Owen')) from ids where first_name = 'Owen'$$,
  '42501', 'nobody confirms their own request', 'the creator cannot confirm her own request');

select set_config('request.jwt.claims', '{"sub":"user_ap_admin","role":"authenticated"}', true);
select throws_ok(
  $$select public.confirm_request(id, (select data from reviewed where first_name = 'Anna')) from ids where first_name = 'Anna'$$,
  '42501', null, 'IT cannot confirm (not an approver)');
select throws_ok(
  $$select public.return_request(id, 'x') from ids where first_name = 'Anna'$$,
  '42501', null, 'IT cannot return a request');
select throws_ok(
  $$select public.approval_preview(id) from ids where first_name = 'Anna'$$,
  '42501', null, 'IT does not use the approver preview');

-- ---------------------------------------------------------------------------
-- Return to Raju
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"user_ap_abe","role":"authenticated"}', true);
select throws_ok(
  $$select public.return_request(id, '   ') from ids where first_name = 'Anna'$$,
  '23514', null, 'returning needs a comment');
select throws_ok(
  $$select public.return_request(id, 'x', '{3}') from ids where first_name = 'Anna'$$,
  '23514', null, 'section 3 (the approver''s own) cannot be flagged');
select throws_ok(
  $$select public.return_request(id, 'x', '{10}') from ids where first_name = 'Anna'$$,
  '23514', null, 'only sections 1–9 can be flagged');

select lives_ok(
  $$select public.return_request(id, ' Figma should be Viewer ', '{5,2,5}') from ids where first_name = 'Anna'$$,
  'Abe returns Anna with a comment and two sections');
select is((select state from public.requests where first_name = 'Anna'),
  'returned'::public.request_state, 'the request is returned');
select ok(
  (select a.decision = 'returned' and a.comment = 'Figma should be Viewer' and a.flagged_sections = '{2,5}'
     and a.decided_by = 'user_ap_abe' and a.decided_at > now() - interval '1 minute'
   from public.approvals a where a.request_id = (select id from ids where first_name = 'Anna')),
  'the decision keeps the comment, the sections (sorted, once) and server time');
select is(
  (select count(*)::int from public.signatures
   where request_id = (select id from ids where first_name = 'Anna') and cleared_at is null),
  0, 'Raju''s signature is cleared');
-- The audit log is read by admins / auditors only.
select set_config('request.jwt.claims', '{"sub":"user_ap_admin","role":"authenticated"}', true);
select ok(
  exists (select 1 from public.audit_events where action = 'request.returned'
          and diff -> 'flagged_sections' = '[2,5]'::jsonb),
  'the return is audited');
select set_config('request.jwt.claims', '{"sub":"user_ap_abe","role":"authenticated"}', true);
select throws_ok(
  $$select public.confirm_request(id, (select data from reviewed where first_name = 'Anna')) from ids where first_name = 'Anna'$$,
  '23514', null, 'a returned request cannot be confirmed');

-- Raju fixes and signs again, with a note.
select set_config('request.jwt.claims', '{"sub":"user_ap_admin","role":"authenticated"}', true);
update public.requests set job_title = 'Senior Analyst' where first_name = 'Anna';
select lives_ok(
  $$select public.sign_request(id, public.request_snapshot_preview(id), ' Fixed — Figma is Viewer ') from ids where first_name = 'Anna'$$,
  'Ada signs again with a note for the approver');

select set_config('request.jwt.claims', '{"sub":"user_ap_abe","role":"authenticated"}', true);
select is(
  (select note from public.request_signature_marks((select id from ids where first_name = 'Anna'))),
  'Fixed — Figma is Viewer', 'the approver sees Raju''s note');
select throws_ok(
  $$select public.confirm_request(id, (select data from reviewed where first_name = 'Anna')) from ids where first_name = 'Anna'$$,
  '40001', null, 'the old review no longer matches the changed request');

-- ---------------------------------------------------------------------------
-- Confirm & sign
-- ---------------------------------------------------------------------------
reset role;
update reviewed set data = private.request_snapshot_data((select id from ids where first_name = 'Anna'))
where first_name = 'Anna';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_ap_abe","role":"authenticated"}', true);
select lives_ok(
  $$select public.confirm_request(id, (select data from reviewed where first_name = 'Anna')) from ids where first_name = 'Anna'$$,
  'Abe confirms what he reviewed');
select ok(
  (select state = 'closed' and closed_at > now() - interval '1 minute' from public.requests where first_name = 'Anna'),
  'the request is closed, at server time');
select ok(
  (select s.signer_id = 'user_ap_abe' and s.signer_role = 'approver' and s.section = 'final_confirmation'
   from public.signatures s
   where s.request_id = (select id from ids where first_name = 'Anna') and s.section = 'final_confirmation'),
  'the approver half of section 11 is signed');
select is(
  (select array_agg(decision order by decided_at)::text[] from public.approvals
   where request_id = (select id from ids where first_name = 'Anna')),
  array['returned', 'confirmed'], 'both rounds are kept');
-- The audit log is read by admins / auditors only.
select set_config('request.jwt.claims', '{"sub":"user_ap_admin","role":"authenticated"}', true);
select ok(
  exists (select 1 from public.audit_events where action = 'request.confirmed'
          and entity_id = (select id::text from ids where first_name = 'Anna')),
  'confirming is audited');
select set_config('request.jwt.claims', '{"sub":"user_ap_abe","role":"authenticated"}', true);

select set_config('request.jwt.claims', '{"sub":"user_ap_cleo","role":"authenticated"}', true);
select throws_ok(
  $$select public.confirm_request(id, (select data from reviewed where first_name = 'Anna')) from ids where first_name = 'Anna'$$,
  '23514', 'this request is not awaiting confirmation', 'the first approver to confirm closes it');

reset role;
select ok(
  (select n.kind = 'approval' and n.sha256 = private.snapshot_sha256(n.data)
     and n.data -> 'request' ->> 'job_title' = 'Senior Analyst'
   from public.approvals a join public.request_snapshots n on n.id = a.snapshot_id
   where a.decision = 'confirmed' and a.request_id = (select id from ids where first_name = 'Anna')),
  'the approval snapshot holds the confirmed data with its SHA-256');
select throws_ok($$update public.approvals set comment = 'edited'$$, '42501', null,
  'approval decisions are never edited');
select throws_ok($$delete from public.approvals$$, '42501', null,
  'approval decisions are never deleted');

select * from finish();
rollback;

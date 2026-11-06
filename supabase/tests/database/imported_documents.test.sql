-- The original signed form of an Imported record (F24d-2): an admin attaches
-- it (the file in the record's own folder), a new one replaces it (the old
-- kept), record readers read it, every download is audited; only Imported
-- records take one. Run: pnpm db:test
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into public.app_users (clerk_user_id, email, first_name, last_name) values
  ('user_id_admin', 'id-admin@example.test', 'Ada', 'Admin'),
  ('user_id_appr',  'id-appr@example.test',  'Abe', 'Approver'),
  ('user_id_req',   'id-req@example.test',   'Rae', 'Requester');
insert into public.user_roles (clerk_user_id, role) values
  ('user_id_admin', 'admin'), ('user_id_admin', 'requester'), ('user_id_admin', 'it_operator'),
  ('user_id_appr', 'approver'), ('user_id_req', 'requester');

create temporary table t (key text primary key, id uuid, ticket text);
grant all on t to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_id_admin","role":"authenticated"}', true);
with x as (insert into public.staff_imports (file_name) values ('staff.xlsx') returning id)
insert into t (key, id) select 'import', id from x;
insert into public.staff_import_rows (import_id, position, person) values
  ((select id from t where key = 'import'), 1, jsonb_build_object(
    'first_name', 'Lea', 'last_name', 'Doc', 'work_email', 'lea.doc@example.test',
    'office_id', (select id from public.offices where name = 'Dubai'), 'start_date', '2025-01-06'));
select public.import_staff((select id from t where key = 'import'));
insert into t (key, id, ticket)
  select 'lea', id, ticket_id from public.requests where work_email = 'lea.doc@example.test';
-- An ordinary draft of the app.
insert into public.requests (created_by, first_name) values ('user_id_admin', 'Plain');
insert into t (key, id, ticket)
  select 'plain', id, ticket_id from public.requests where first_name = 'Plain' and created_by = 'user_id_admin';

reset role;
insert into storage.objects (bucket_id, name, owner_id)
  select 'records', ticket || '/signed-1.pdf', 'user_id_admin' from t where key = 'lea'
  union all
  select 'records', ticket || '/signed-2.pdf', 'user_id_admin' from t where key = 'lea';
set local role authenticated;

select throws_ok(
  $$select public.attach_imported_document((select id from t where key = 'lea'),
    (select ticket from t where key = 'lea') || '/missing.pdf', 'x.pdf', repeat('a', 64), 100)$$,
  '23514', null, 'the PDF must be uploaded first');
select throws_ok(
  $$select public.attach_imported_document((select id from t where key = 'plain'),
    (select ticket from t where key = 'plain') || '/x.pdf', 'x.pdf', repeat('a', 64), 100)$$,
  '23514', null, 'only an Imported record takes an original signed form');
select throws_ok(
  $$select public.attach_imported_document((select id from t where key = 'lea'),
    'IMP-1999-000001/signed-1.pdf', 'x.pdf', repeat('a', 64), 100)$$,
  '23514', null, 'the file must be in the record''s own folder');

select isnt(public.attach_imported_document((select id from t where key = 'lea'),
  (select ticket from t where key = 'lea') || '/signed-1.pdf', 'lea.doc-onboarding-signed.pdf',
  repeat('ab', 32), 2048), null, 'an admin attaches the signed PDF');
select ok(exists (select 1 from public.audit_events where action = 'import.document_attached'
                  and entity_id = (select id::text from t where key = 'lea')
                  and diff ->> 'replaced' = 'false'),
  '… audited import.document_attached');

select public.attach_imported_document((select id from t where key = 'lea'),
  (select ticket from t where key = 'lea') || '/signed-2.pdf', 'lea.doc-onboarding-signed-v2.pdf',
  repeat('cd', 32), 4096);
select is((select count(*) from public.imported_documents
           where request_id = (select id from t where key = 'lea') and replaced_at is null),
  1::bigint, 'one current document: the newer one …');
select is((select count(*) from public.imported_documents
           where request_id = (select id from t where key = 'lea')),
  2::bigint, '… the replaced one is kept');
select ok(exists (select 1 from public.audit_events where action = 'import.document_attached'
                  and entity_id = (select id::text from t where key = 'lea')
                  and diff ->> 'replaced' = 'true'),
  'the replacement is audited as such');

select throws_ok($$insert into public.imported_documents (request_id, file_name, storage_path, sha256, size_bytes, attached_by)
                   values ((select id from t where key = 'lea'), 'x', 'x', repeat('a', 64), 1, 'user_id_admin')$$,
  '42501', null, 'nobody writes the table directly');

-- An approver reads it and downloads it (audited); a requester can't attach or read.
select set_config('request.jwt.claims', '{"sub":"user_id_appr","role":"authenticated"}', true);
select is((select file_name from public.imported_documents
           where request_id = (select id from t where key = 'lea') and replaced_at is null),
  'lea.doc-onboarding-signed-v2.pdf', 'an approver reads the current document');
select public.log_imported_document_download((select id from public.imported_documents
  where request_id = (select id from t where key = 'lea') and replaced_at is null));
reset role; -- approvers don't read the audit log
select ok(exists (select 1 from public.audit_events where action = 'import.document_downloaded'
                  and actor_id = 'user_id_appr'),
  'a download is audited');
set local role authenticated;
select throws_ok(
  $$select public.attach_imported_document((select id from t where key = 'lea'),
    (select ticket from t where key = 'lea') || '/signed-1.pdf', 'x.pdf', repeat('a', 64), 100)$$,
  '42501', null, 'an approver cannot attach');

select set_config('request.jwt.claims', '{"sub":"user_id_req","role":"authenticated"}', true);
select is((select count(*) from public.imported_documents), 0::bigint,
  'a requester (no Records) reads no documents');

select * from finish();
rollback;

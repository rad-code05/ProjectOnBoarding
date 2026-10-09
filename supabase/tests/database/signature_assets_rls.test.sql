-- Signature assets and the private "signatures" bucket (F05a).
-- Run: pnpm db:test   (needs the local database: pnpm db:start)
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

-- Fixtures (fake people only), inserted as the table owner.
insert into public.app_users (clerk_user_id, email, first_name, last_name) values
  ('user_sg_raju',   'sg-raju@example.test',   'Ra', 'Ju'),
  ('user_sg_moises', 'sg-moises@example.test', 'Mo', 'Ises');
insert into public.user_roles (clerk_user_id, role) values
  ('user_sg_raju', 'admin'), ('user_sg_raju', 'it_operator'),
  ('user_sg_moises', 'approver');

-- ---------------------------------------------------------------------------
-- Bucket
-- ---------------------------------------------------------------------------
select ok(
  (select not public and file_size_limit = 1048576 and allowed_mime_types = array['image/png']
   from storage.buckets where id = 'signatures'),
  'the signatures bucket is private, PNG only, max 1 MB');

-- ---------------------------------------------------------------------------
-- Moises adds his own signature
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_sg_moises","role":"authenticated"}', true);

select lives_ok(
  $$insert into public.signature_assets (user_id, kind, source, storage_path, width, height, byte_size, sha256)
    values ('user_sg_moises', 'signature', 'png', 'user_sg_moises/v1.png', 640, 200, 84000, repeat('a', 64))$$,
  'Moises uploads his own signature');
select ok(
  (select is_active and retired_at is null from public.signature_assets where storage_path = 'user_sg_moises/v1.png'),
  'a new signature becomes the active one');
select throws_ok(
  $$insert into public.signature_assets (user_id, kind, source, storage_path, width, height, byte_size, sha256)
    values ('user_sg_raju', 'signature', 'png', 'user_sg_raju/x.png', 640, 200, 84000, repeat('b', 64))$$,
  '42501', null, 'nobody adds a signature for someone else');
select throws_ok(
  $$insert into public.signature_assets (user_id, kind, source, storage_path, width, height, byte_size, sha256)
    values ('user_sg_moises', 'signature', 'png', 'user_sg_raju/x.png', 640, 200, 84000, repeat('b', 64))$$,
  '23514', null, 'the file must sit in the owner''s own folder');
select throws_ok(
  $$insert into public.signature_assets (user_id, kind, source, typed_text)
    values ('user_sg_moises', 'signature', 'typed', 'ML')$$,
  '23514', null, 'a signature must be a PNG (only initials can be typed)');
select throws_ok(
  $$insert into public.signature_assets (user_id, kind, source, typed_text)
    values ('user_sg_moises', 'initials', 'typed', 'MLARS')$$,
  '23514', null, 'typed initials are 1–4 characters');

select lives_ok(
  $$insert into public.signature_assets (user_id, kind, source, typed_text)
    values ('user_sg_moises', 'initials', 'typed', 'ML')$$,
  'Moises types his initials');
select ok(
  (select is_active from public.signature_assets where typed_text = 'ML')
  and (select not is_active and retired_at is null from public.signature_assets where storage_path = 'user_sg_moises/v1.png'),
  'only one is active; the signature is kept (not replaced)');

select lives_ok(
  $$insert into public.signature_assets (user_id, kind, source, storage_path, width, height, byte_size, sha256)
    values ('user_sg_moises', 'signature', 'png', 'user_sg_moises/v2.png', 600, 180, 70000, repeat('c', 64))$$,
  'Moises replaces his signature');
select ok(
  (select retired_at is not null and not is_active from public.signature_assets where storage_path = 'user_sg_moises/v1.png'),
  'the old signature is kept as replaced (history)');

select lives_ok(
  $$select public.set_active_signature((select id from public.signature_assets where typed_text = 'ML'))$$,
  'he switches back to signing with his initials');
select is(
  (select count(*)::int from public.signature_assets where is_active), 1,
  'still exactly one active');
select throws_ok(
  $$select public.set_active_signature((select id from public.signature_assets where storage_path = 'user_sg_moises/v1.png'))$$,
  '42501', null, 'a replaced version cannot be made active again');
select throws_ok(
  $$update public.signature_assets set typed_text = 'XX' where typed_text = 'ML'$$,
  '42501', null, 'versions are never edited');
select throws_ok(
  $$delete from public.signature_assets$$,
  '42501', null, 'versions are never deleted');

-- Storage: own folder only.
select lives_ok(
  $$insert into storage.objects (bucket_id, name, owner_id) values ('signatures', 'user_sg_moises/v3.png', 'user_sg_moises')$$,
  'Moises can store a file in his own folder');
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner_id) values ('signatures', 'user_sg_raju/evil.png', 'user_sg_moises')$$,
  '42501', null, 'nobody can store a file in someone else''s folder');

-- ---------------------------------------------------------------------------
-- Raju (admin) cannot see or use Moises's signature
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"user_sg_raju","role":"authenticated"}', true);
select is_empty($$select * from public.signature_assets$$, 'even an admin does not see someone else''s signatures');
select is_empty(
  $$select * from storage.objects where bucket_id = 'signatures'$$,
  'nor their signature files');
select throws_ok(
  $$select public.set_active_signature((select id from public.signature_assets limit 1))$$,
  '42501', null, 'nor switch someone else''s active signature');

-- The audit log is read as the owner (approvers cannot read it).
reset role;
select ok(
  exists (select 1 from public.audit_events where action = 'signature.added')
  and exists (select 1 from public.audit_events where action = 'signature.activated'),
  'adding and switching are audited');

select * from finish();
rollback;

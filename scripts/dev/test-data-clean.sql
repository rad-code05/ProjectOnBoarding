-- DEV ONLY — removes every request and person (test data) from a database,
-- before `test-data-seed.sql` loads the standard test set (2026-10-25,
-- decided by Raju: "All test data, keep audit").
--
-- Keeps: user accounts and roles, signatures on file (My profile), the
-- catalog, offices, settings, the assistant's data, custom reports — and
-- the audit log (append-only: it still says the old requests existed).
-- Removes: requests and their items, section 9, snapshots, signatures
-- applied to requests, approvals, PDF records (rows; the files go with
-- `test-data-storage.mjs`), the access inventory and the people.
--
-- Signatures, snapshots, approvals and PDF records are protected against
-- deletion ("a record never vanishes"): those triggers are switched off for
-- this transaction only, and the item audit triggers too, so the clean-up
-- writes ONE audit event (dev.test_data_reset) instead of hundreds.
--
-- Run as the database owner: local first —
--   docker exec -i supabase_db_laine-onboarding psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q < scripts/dev/test-data-clean.sql
--   (`supabase db query --local` runs one statement only)
-- then the cloud dev database, only with Raju's OK —
--   pnpm exec supabase db query --linked -f scripts/dev/test-data-clean.sql
-- NEVER on a production database.
begin;

-- Guard: only a dev / test database holds the e2e test accounts.
do $$
begin
  if not exists (select 1 from public.app_users where email like 'e2e.%+clerk\_test@%') then
    raise exception 'no e2e test accounts here — refusing to clean what may be a production database';
  end if;
end;
$$;

create temporary table cleaned as
select
  (select count(*) from public.requests) as requests,
  (select count(*) from public.employees) as people,
  (select count(*) from public.signatures) as signatures,
  (select count(*) from public.pdf_documents) as pdf_records;

alter table public.signatures disable trigger signatures_no_delete;
alter table public.request_snapshots disable trigger request_snapshots_no_change;
alter table public.approvals disable trigger approvals_no_change;
alter table public.pdf_documents disable trigger pdf_documents_no_change;
alter table public.employee_access_inventory disable trigger inventory_guard;
alter table public.request_access_items disable trigger request_access_items_audit;
alter table public.request_equipment_items disable trigger request_equipment_items_audit;
alter table public.request_physical_access_items disable trigger request_physical_access_items_audit;

-- Order matters: items on access changes point at the inventory, the
-- inventory points at requests, everything points at requests / people.
delete from public.request_access_items;
delete from public.request_equipment_items;
delete from public.request_physical_access_items;
delete from public.execution_confirmations;
delete from public.employee_access_inventory;
delete from public.pdf_documents;
delete from public.approvals;
delete from public.signatures;
delete from public.request_snapshots;
delete from public.requests;
delete from public.employees;

alter table public.signatures enable trigger signatures_no_delete;
alter table public.request_snapshots enable trigger request_snapshots_no_change;
alter table public.approvals enable trigger approvals_no_change;
alter table public.pdf_documents enable trigger pdf_documents_no_change;
alter table public.employee_access_inventory enable trigger inventory_guard;
alter table public.request_access_items enable trigger request_access_items_audit;
alter table public.request_equipment_items enable trigger request_equipment_items_audit;
alter table public.request_physical_access_items enable trigger request_physical_access_items_audit;

-- One audit event for the whole clean-up (actor: none = system).
insert into public.audit_events (actor_id, action, entity, entity_id, source, diff)
select null, 'dev.test_data_reset', 'database', 'test_data', 'system',
  jsonb_build_object('requests', requests, 'people', people, 'signatures', signatures,
    'pdf_records', pdf_records, 'note', 'Test data removed before loading the standard test set (Raju, 2026-10-25).')
from cleaned;

select * from cleaned;
commit;

-- F24f-2 — Publish form v4.3 (Employee or contractor — added in
-- 20261106130000_worker_type.sql) now that section 2 draws the switch.
--
-- From now on new requests use v4.3: Employee or contractor is required
-- before Review & sign, and Office is required for employees only.
-- Requests already created keep the version they were made with, as every
-- request does — their form and their rules don't change.
--
-- As in 20261021130000_publish_form_4_2.sql: published versions are
-- protected (forbid_change); moving "current" is the one update allowed here,
-- with the protection briefly off, and recorded in the audit log.

alter table public.form_versions disable trigger form_versions_no_change;
update public.form_versions set is_current = false where version = '4.2';
update public.form_versions set is_current = true where version = '4.3';
alter table public.form_versions enable trigger form_versions_no_change;

select private.write_audit('form.version_published', 'form_version',
  (select id::text from public.form_versions where version = '4.3'),
  jsonb_build_object('version', '4.3', 'previous', '4.2',
    'added', jsonb_build_array('Employee or contractor')));

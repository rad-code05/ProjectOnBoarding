-- F27c — Publish form v4.2 (Office, State, City, Nationality — added in
-- 20261021120000_offices.sql) now that the screens draw those fields.
--
-- From now on new requests use v4.2: Office is required before Review & sign.
-- Requests already created keep the version they were made with (v4.1), as
-- every request does — their form and their rules don't change.
--
-- Published versions are protected against changes (forbid_change); moving
-- "current" from one version to the next is the one update allowed here,
-- done with the protection briefly off, and recorded in the audit log.
-- (Admin → Form fields & versions, F20/F21, will do this with a button.)

alter table public.form_versions disable trigger form_versions_no_change;
update public.form_versions set is_current = false where version = '4.1';
update public.form_versions set is_current = true where version = '4.2';
alter table public.form_versions enable trigger form_versions_no_change;

select private.write_audit('form.version_published', 'form_version',
  (select id::text from public.form_versions where version = '4.2'),
  jsonb_build_object('version', '4.2', 'previous', '4.1',
    'added', jsonb_build_array('Office', 'State', 'City', 'Nationality')));

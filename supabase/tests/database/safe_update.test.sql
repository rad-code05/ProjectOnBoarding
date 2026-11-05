-- Calls through the API (PostgREST) load Supabase's pg_safeupdate: an UPDATE
-- or DELETE without WHERE is refused there, even on a one-row table. These
-- tests run as postgres without it (and may not load it), so read every
-- function instead: none may have such a statement. F23d found one in the
-- browser (admin_save_notification_settings). Run: pnpm db:test
begin;
create extension if not exists pgtap with schema extensions;
select plan(1);

select is_empty(
  $$
  select n.nspname || '.' || p.proname
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  join pg_language l on l.oid = p.prolang,
  lateral regexp_split_to_table(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), ';') s
  where n.nspname in ('public', 'private')
    and l.lanname in ('plpgsql', 'sql')
    and s ~* '(^|[\s(])(update\s+\S+\s+set|delete\s+from)\s'
    and s !~* '\mwhere\M'
  $$,
  'no function updates or deletes without WHERE (the API''s safe-update guard)');

select * from finish();
rollback;

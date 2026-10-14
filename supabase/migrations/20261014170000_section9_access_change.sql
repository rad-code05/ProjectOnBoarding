-- Section 9 on an access change (Raju, 2026-10-14).
--
-- * Labels per request type: "All authorised access provisioned" on an
--   onboarding, "All authorised access modified" on an access change (the
--   record and the PDF use the same label as the screen).
-- * A new answer "no_change": the request changes nothing in that item's
--   area. It counts as complete; the record and the PDF print "No changes
--   made".
-- * When an access change starts execution, section 9 is pre-filled by what
--   changed: access → "no_change" without app / access lines; devices →
--   without device lines; security controls (MFA, MDM, EDR) → when nothing
--   new is added (no new app, access or device). Raju ticks the rest.

-- ---------------------------------------------------------------------------
-- 1. Labels per type
-- ---------------------------------------------------------------------------
alter table public.execution_checklist_items
  add column type_labels jsonb not null default '{}'::jsonb
    check (jsonb_typeof(type_labels) = 'object');
comment on column public.execution_checklist_items.type_labels is 'Label per request type, e.g. {"onboarding": "…provisioned", "access_modification": "…modified"}; falls back to label.';

update public.execution_checklist_items
set type_labels = jsonb_build_object(
  'onboarding', 'All authorised access provisioned',
  'access_modification', 'All authorised access modified')
where key = 'access_provisioned';

-- ---------------------------------------------------------------------------
-- 2. Answers: true, false, "not_needed" or "no_change"
--    (as in 20261013140000_section9_not_needed.sql; only the allowed values changed)
-- ---------------------------------------------------------------------------
create or replace function private.execution_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type public.request_type;
  v_bad text;
begin
  if tg_op = 'UPDATE' and new.request_id is distinct from old.request_id then
    raise exception 'the request of a confirmation cannot change' using errcode = 'insufficient_privilege';
  end if;
  select r.type into v_type from public.requests r where r.id = new.request_id;
  select k into v_bad
  from jsonb_each(new.checks) as c(k, v)
  where (jsonb_typeof(v) <> 'boolean' and v not in ('"not_needed"'::jsonb, '"no_change"'::jsonb))
     or not exists (select 1 from public.execution_checklist_items i
                    where i.key = k and i.active and v_type = any (i.applies_to))
  limit 1;
  if v_bad is not null then
    raise exception 'checklist item % does not apply to this request', v_bad using errcode = 'check_violation';
  end if;
  new.notes := nullif(trim(new.notes), '');
  new.executed_by := coalesce(private.current_user_id(), new.executed_by);
  new.created_at := case when tg_op = 'INSERT' then now() else old.created_at end;
  new.updated_at := now();
  return new;
end;
$$;

-- Done, not needed or no change counts as complete.
create or replace function private.execution_complete(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(bool_and(coalesce(
           c.checks -> i.key in ('true'::jsonb, '"not_needed"'::jsonb, '"no_change"'::jsonb), false)), false)
  from public.requests r
  join public.execution_checklist_items i on i.active and r.type = any (i.applies_to)
  left join public.execution_confirmations c on c.request_id = r.id
  where r.id = p_request_id
$$;

-- ---------------------------------------------------------------------------
-- 3. Pre-fill when an access change starts execution
-- ---------------------------------------------------------------------------
create function private.access_change_checks(p_request_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'access_provisioned',
      case when not exists (select 1 from public.request_access_items where request_id = p_request_id)
            and not exists (select 1 from public.request_physical_access_items where request_id = p_request_id)
           then to_jsonb('no_change'::text) end,
    'devices_enrolled',
      case when not exists (select 1 from public.request_equipment_items where request_id = p_request_id)
           then to_jsonb('no_change'::text) end,
    'security_controls',
      case when not exists (select 1 from public.request_access_items
                            where request_id = p_request_id and inventory_id is null and action <> 'Remove')
            and not exists (select 1 from public.request_physical_access_items
                            where request_id = p_request_id and inventory_id is null
                              and action not in ('Disable', 'Remove'))
            and not exists (select 1 from public.request_equipment_items
                            where request_id = p_request_id and action = 'Issue')
           then to_jsonb('no_change'::text) end))
$$;
comment on function private.access_change_checks(uuid) is 'Section 9 answers an access change starts with: "no_change" for each item whose area the request does not touch.';

create function private.prefill_access_change_checks()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_checks jsonb := private.access_change_checks(new.id);
begin
  insert into public.execution_confirmations (request_id, checks, executed_by)
  values (new.id, v_checks, coalesce(private.current_user_id(), new.created_by))
  on conflict (request_id) do update
    set checks = excluded.checks || public.execution_confirmations.checks;
  return null;
end;
$$;

create trigger requests_e_prefill_access_change_checks after update of state on public.requests
for each row
when (new.type = 'access_modification' and new.state = 'in_execution' and old.state = 'draft')
execute function private.prefill_access_change_checks();

revoke all on function private.access_change_checks(uuid) from public;
revoke all on function private.prefill_access_change_checks() from public;

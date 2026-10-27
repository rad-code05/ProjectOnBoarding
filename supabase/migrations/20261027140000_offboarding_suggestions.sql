-- Offboarding by chat, part B2 (Raju's test round, 2026-10-27).
--
--   request_suggestions.kind 'removal'  how an application on an offboarding
--       is removed: target "removal:<request_access_items id>", value
--       { method: Delete | Suspend | Disable }.
--   request_suggestions.kind 'mailbox'  target "mailbox", value
--       "converted_shared" | "no_mailbox".
--   Both are accepted through the screen's own steps (set_removal,
--   set_mailbox_handling), so — like on the screen — only once execution has
--   started; the person can accept them then, audited source = ai.
-- suggest_request_values() and accept_request_suggestion() are replaced
-- from their latest definition (20261027120000_held_suggestions.sql).

alter table public.request_suggestions drop constraint request_suggestions_kind_check;
alter table public.request_suggestions add constraint request_suggestions_kind_check
  check (kind in ('field', 'access', 'equipment', 'physical', 'held', 'removal', 'mailbox'));

-- The application row id in "removal:<uuid>" (null when malformed).
create function private.suggestion_removal_id(p_target text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case when p_target ~ '^removal:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then substring(p_target from 9)::uuid end;
$$;
revoke all on function private.suggestion_removal_id(text) from public;
grant execute on function private.suggestion_removal_id(text) to authenticated;

create or replace function public.suggest_request_values(p_request_id uuid, p_suggestions jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user text := private.current_user_id();
  v_state public.request_state;
  v_item jsonb;
  v_kind text;
  v_target text;
  v_id smallint;
  v_type public.request_type;
  v_employee uuid;
  v_count integer := 0;
begin
  if not (private.is_active_user()
          and private.has_any_role(array['admin', 'requester']::public.app_role[])) then
    raise exception 'only admins and requesters can prepare requests' using errcode = '42501';
  end if;
  select state, type, employee_id into v_state, v_type, v_employee
    from public.requests where id = p_request_id;
  if v_state is null then
    raise exception 'request not found' using errcode = '22023';
  end if;
  if v_state not in ('draft', 'in_execution', 'returned') then
    raise exception 'this request can''t be changed any more' using errcode = '22023';
  end if;
  if jsonb_typeof(p_suggestions) <> 'array'
     or jsonb_array_length(p_suggestions) not between 1 and 60 then
    raise exception 'send between 1 and 60 suggestions' using errcode = '22023';
  end if;

  for v_item in select * from jsonb_array_elements(p_suggestions) loop
    v_kind := v_item ->> 'kind';
    v_target := v_item ->> 'target';
    if v_item -> 'value' is null then
      raise exception 'suggestion for % has no value', coalesce(v_target, '?') using errcode = '22023';
    end if;
    if v_kind = 'field' then
      if not coalesce(private.suggestion_field_ok(v_target), false) then
        raise exception 'unknown field %', coalesce(v_target, '?') using errcode = '22023';
      end if;
    elsif v_kind = 'access' then
      v_id := private.suggestion_target_id(v_target, 'app');
      if not exists (select 1 from public.catalog_apps where id = v_id and active) then
        raise exception 'unknown application %', coalesce(v_target, '?') using errcode = '22023';
      end if;
    elsif v_kind = 'equipment' then
      v_id := private.suggestion_target_id(v_target, 'equipment');
      if not exists (select 1 from public.equipment_types where id = v_id and active) then
        raise exception 'unknown equipment type %', coalesce(v_target, '?') using errcode = '22023';
      end if;
    elsif v_kind = 'physical' then
      v_id := private.suggestion_target_id(v_target, 'access');
      if not exists (select 1 from public.physical_access_types where id = v_id and active) then
        raise exception 'unknown access type %', coalesce(v_target, '?') using errcode = '22023';
      end if;
    elsif v_kind = 'removal' then
      -- How an application on this offboarding is removed (Delete / Suspend /
      -- Disable) — recorded once execution has started (set_removal).
      if v_type <> 'offboarding'
         or not exists (select 1 from public.request_access_items a
                        where a.id = private.suggestion_removal_id(v_target)
                          and a.request_id = p_request_id)
         or (v_item -> 'value' ->> 'method') not in ('Delete', 'Suspend', 'Disable') then
        raise exception 'not a removal on this offboarding: %', coalesce(v_target, '?') using errcode = '22023';
      end if;
    elsif v_kind = 'mailbox' then
      if v_type <> 'offboarding' or v_target <> 'mailbox'
         or (v_item ->> 'value') not in ('converted_shared', 'no_mailbox') then
        raise exception 'the mailbox is converted_shared or no_mailbox, on an offboarding' using errcode = '22023';
      end if;
    elsif v_kind = 'held' then
      -- An item the person holds today, on their own access change.
      if v_type <> 'access_modification'
         or not exists (select 1 from public.employee_access_inventory i
                        where i.id = private.suggestion_held_id(v_target)
                          and i.employee_id = v_employee and i.ended_at is null) then
        raise exception 'not an item this person holds: %', coalesce(v_target, '?') using errcode = '22023';
      end if;
    else
      raise exception 'unknown kind %', coalesce(v_kind, '?') using errcode = '22023';
    end if;
    if v_kind not in ('field', 'mailbox') and jsonb_typeof(v_item -> 'value') <> 'object' then
      raise exception 'suggestion for % needs an object value', v_target using errcode = '22023';
    end if;

    update public.request_suggestions
       set status = 'replaced', decided_by = v_user, decided_at = now()
     where request_id = p_request_id and target = v_target and status = 'pending';
    insert into public.request_suggestions (request_id, kind, target, value, reason, created_by)
    values (p_request_id, v_kind, v_target, v_item -> 'value',
            nullif(left(trim(v_item ->> 'reason'), 200), ''), v_user);
    v_count := v_count + 1;
  end loop;

  perform set_config('app.audit_source', 'ai', true);
  perform private.write_audit('request.suggested', 'request', p_request_id::text,
    jsonb_build_object('count', v_count,
      'targets', (select jsonb_agg(x ->> 'target') from jsonb_array_elements(p_suggestions) x)));
  return v_count;
end;
$$;

create or replace function public.accept_request_suggestion(p_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  s public.request_suggestions;
  inv public.employee_access_inventory;
  v_id smallint;
  v_version integer;
begin
  select * into s from public.request_suggestions where id = p_id;
  if s.id is null or s.status <> 'pending' then
    raise exception 'this suggestion is no longer waiting' using errcode = '22023';
  end if;

  perform set_config('app.audit_source', 'ai', true);
  if s.kind = 'field' then
    if not private.suggestion_field_ok(s.target) then
      raise exception 'unknown field %', s.target using errcode = '22023';
    end if;
    execute format(
      'update public.requests set %1$I = (jsonb_populate_record(null::public.requests, $1)).%1$I where id = $2',
      s.target)
      using jsonb_build_object(s.target, s.value), s.request_id;
    get diagnostics v_version = row_count;
    if v_version = 0 then
      raise exception 'this request can''t be changed any more' using errcode = '42501';
    end if;
  elsif s.kind = 'access' then
    v_id := private.suggestion_target_id(s.target, 'app');
    update public.request_access_items
       set action = s.value ->> 'action', permission = s.value ->> 'permission',
           notes = s.value ->> 'notes'
     where request_id = s.request_id and app_id = v_id;
    if not found then
      insert into public.request_access_items (request_id, app_id, category_name, app_name, action, permission, notes)
      values (s.request_id, v_id, '', '-', s.value ->> 'action', s.value ->> 'permission', s.value ->> 'notes');
    end if;
  elsif s.kind = 'removal' then
    -- The same step as choosing the method on the screen (in execution only).
    perform public.set_removal('application', private.suggestion_removal_id(s.target),
                               null, s.value ->> 'method');
  elsif s.kind = 'mailbox' then
    perform public.set_mailbox_handling(s.request_id, s.value #>> '{}');
  elsif s.kind = 'held' then
    -- Change or remove what they hold — the writes of the access-change
    -- screen (setHeldChange): one line per held item, linked to it.
    select * into inv from public.employee_access_inventory
     where id = private.suggestion_held_id(s.target);
    if inv.id is null then
      raise exception 'that item isn''t held any more' using errcode = '22023';
    end if;
    if inv.kind = 'application' then
      update public.request_access_items
         set action = s.value ->> 'action', permission = s.value ->> 'value',
             notes = s.value ->> 'notes'
       where request_id = s.request_id and inventory_id = inv.id;
      if not found then
        insert into public.request_access_items
          (request_id, inventory_id, app_id, category_name, app_name, action, permission, notes)
        values (s.request_id, inv.id, inv.app_id, coalesce(inv.category_name, ''), inv.name,
                s.value ->> 'action', s.value ->> 'value', s.value ->> 'notes');
      end if;
    elsif inv.kind = 'equipment' then
      update public.request_equipment_items
         set action = s.value ->> 'action', notes = s.value ->> 'notes'
       where request_id = s.request_id and inventory_id = inv.id;
      if not found then
        insert into public.request_equipment_items
          (request_id, inventory_id, type_id, type_name, action, notes)
        values (s.request_id, inv.id, inv.equipment_type_id, inv.name,
                s.value ->> 'action', s.value ->> 'notes');
      end if;
    else
      update public.request_physical_access_items
         set action = s.value ->> 'action', scope = s.value ->> 'value',
             notes = s.value ->> 'notes'
       where request_id = s.request_id and inventory_id = inv.id;
      if not found then
        insert into public.request_physical_access_items
          (request_id, inventory_id, type_id, type_name, action, scope, notes)
        values (s.request_id, inv.id, inv.access_type_id, inv.name,
                s.value ->> 'action', s.value ->> 'value', s.value ->> 'notes');
      end if;
    end if;
  elsif s.kind = 'equipment' then
    v_id := private.suggestion_target_id(s.target, 'equipment');
    insert into public.request_equipment_items (request_id, type_id, type_name, action, description, notes)
    values (s.request_id, v_id, '-', s.value ->> 'action', s.value ->> 'description', s.value ->> 'notes');
  else
    v_id := private.suggestion_target_id(s.target, 'access');
    update public.request_physical_access_items
       set action = s.value ->> 'action', scope = s.value ->> 'scope', notes = s.value ->> 'notes'
     where request_id = s.request_id and type_id = v_id;
    if not found then
      insert into public.request_physical_access_items (request_id, type_id, type_name, action, scope, notes)
      values (s.request_id, v_id, '-', s.value ->> 'action', s.value ->> 'scope', s.value ->> 'notes');
    end if;
  end if;

  perform private.decide_suggestion(p_id, 'accepted');
  select version into v_version from public.requests where id = s.request_id;
  return jsonb_build_object('kind', s.kind, 'target', s.target, 'version', v_version);
end;
$$;

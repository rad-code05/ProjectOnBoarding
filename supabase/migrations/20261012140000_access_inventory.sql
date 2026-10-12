-- F09a — The access inventory: what each person holds today (D20, in v1).
--
-- employee_access_inventory: one row per application, device or access type a
--   person was given. Filled by the database when a request CLOSES (Moises's
--   Confirm & sign) — never typed: "hold" actions (Grant, Modify, Enroll,
--   Issue) add a row, "remove" actions (Remove, Disable, Return) end the row.
--   A Grant / Modify of something already held ends the old row as "replaced"
--   and adds the new one, so the history stays complete. Rows are never
--   deleted. Offboarding (F09b) pre-fills its removals from the rows still
--   held; people who joined before the app come with the Excel import (F24,
--   source 'import').
-- Back-filled below from the requests already closed, oldest first.

-- ---------------------------------------------------------------------------
-- 1. The table
-- ---------------------------------------------------------------------------
create type public.inventory_kind as enum ('application', 'equipment', 'access');

create table public.employee_access_inventory (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id),
  kind public.inventory_kind not null,
  -- Exactly one of these for its kind (an "Other" application has none).
  app_id smallint references public.catalog_apps (id),
  equipment_type_id smallint references public.equipment_types (id),
  access_type_id smallint references public.physical_access_types (id),
  -- Names copied when granted, so renamed / retired items still read right.
  name text not null check (length(trim(name)) between 1 and 80),
  category_name text,
  -- Application permission, or access scope.
  permission text,
  description text,
  asset_tag text,
  source text not null default 'request' check (source in ('request', 'import')),
  granted_request_id uuid references public.requests (id),
  granted_at timestamptz not null,
  ended_request_id uuid references public.requests (id),
  ended_at timestamptz,
  end_reason text check (end_reason in ('removed', 'replaced')),
  created_at timestamptz not null default now(),
  check (source = 'import' or granted_request_id is not null),
  check ((ended_at is null) = (end_reason is null)),
  check (
    case kind
      when 'application' then equipment_type_id is null and access_type_id is null
      when 'equipment' then equipment_type_id is not null and app_id is null and access_type_id is null
      when 'access' then access_type_id is not null and app_id is null and equipment_type_id is null
    end
  )
);
comment on table public.employee_access_inventory is 'What each person holds (apps, devices, access), built from closed requests (and the F24 import). Written only by the database; never deleted.';
comment on column public.employee_access_inventory.ended_at is 'null = still held. end_reason: removed (Remove / Disable / Return) or replaced (granted again with a new permission / scope).';

-- One current row per catalog app / "Other" app name / access type and person.
create unique index inventory_one_current_app on public.employee_access_inventory (employee_id, app_id)
  where kind = 'application' and app_id is not null and ended_at is null;
create unique index inventory_one_current_other_app on public.employee_access_inventory (employee_id, lower(name))
  where kind = 'application' and app_id is null and ended_at is null;
create unique index inventory_one_current_access on public.employee_access_inventory (employee_id, access_type_id)
  where kind = 'access' and ended_at is null;
create index inventory_held_idx on public.employee_access_inventory (employee_id) where ended_at is null;

-- ---------------------------------------------------------------------------
-- 2. Applying a closed request
-- ---------------------------------------------------------------------------
create function private.apply_request_to_inventory(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.requests;
  v_at timestamptz;
  v_item record;
  v_target uuid;
  v_n integer;
  v_added integer := 0;
  v_ended integer := 0;
begin
  select * into v_request from public.requests where id = p_request_id;
  if not found or v_request.employee_id is null then
    return jsonb_build_object('added', 0, 'ended', 0);
  end if;
  v_at := coalesce(v_request.closed_at, now());

  -- Applications: any line ends what is held for that app; hold actions add the new row.
  for v_item in
    select * from public.request_access_items where request_id = p_request_id order by created_at, id
  loop
    update public.employee_access_inventory i
    set ended_at = v_at, ended_request_id = p_request_id,
        end_reason = case when v_item.action in ('Grant', 'Modify', 'Enroll') then 'replaced' else 'removed' end
    where i.employee_id = v_request.employee_id and i.kind = 'application' and i.ended_at is null
      and case when v_item.app_id is not null then i.app_id = v_item.app_id
               else i.app_id is null and lower(i.name) = lower(v_item.app_name) end;
    get diagnostics v_n = row_count;
    v_ended := v_ended + v_n;
    if v_item.action in ('Grant', 'Modify', 'Enroll') then
      insert into public.employee_access_inventory
        (employee_id, kind, app_id, name, category_name, permission, granted_request_id, granted_at)
      values (v_request.employee_id, 'application', v_item.app_id, v_item.app_name, v_item.category_name,
        v_item.permission, p_request_id, v_at);
      v_added := v_added + 1;
    end if;
  end loop;

  -- Equipment: Issue adds a device; Return ends the matching one (same asset tag,
  -- else the oldest of that type still held).
  for v_item in
    select * from public.request_equipment_items where request_id = p_request_id order by created_at, id
  loop
    if v_item.action = 'Issue' then
      insert into public.employee_access_inventory
        (employee_id, kind, equipment_type_id, name, description, asset_tag, granted_request_id, granted_at)
      values (v_request.employee_id, 'equipment', v_item.type_id, v_item.type_name, v_item.description,
        v_item.asset_tag, p_request_id, v_at);
      v_added := v_added + 1;
    else
      select i.id into v_target
      from public.employee_access_inventory i
      where i.employee_id = v_request.employee_id and i.kind = 'equipment' and i.ended_at is null
        and i.equipment_type_id = v_item.type_id
        and (v_item.asset_tag is null or i.asset_tag is not distinct from v_item.asset_tag)
      order by i.granted_at, i.id
      limit 1;
      if v_target is not null then
        update public.employee_access_inventory
        set ended_at = v_at, ended_request_id = p_request_id, end_reason = 'removed'
        where id = v_target;
        v_ended := v_ended + 1;
      end if;
    end if;
  end loop;

  -- Physical & logical access: Grant / Modify replace, Disable / Remove end.
  for v_item in
    select * from public.request_physical_access_items where request_id = p_request_id order by created_at, id
  loop
    update public.employee_access_inventory i
    set ended_at = v_at, ended_request_id = p_request_id,
        end_reason = case when v_item.action in ('Grant', 'Modify') then 'replaced' else 'removed' end
    where i.employee_id = v_request.employee_id and i.kind = 'access' and i.ended_at is null
      and i.access_type_id = v_item.type_id;
    get diagnostics v_n = row_count;
    v_ended := v_ended + v_n;
    if v_item.action in ('Grant', 'Modify') then
      insert into public.employee_access_inventory
        (employee_id, kind, access_type_id, name, permission, granted_request_id, granted_at)
      values (v_request.employee_id, 'access', v_item.type_id, v_item.type_name, v_item.scope,
        p_request_id, v_at);
      v_added := v_added + 1;
    end if;
  end loop;

  return jsonb_build_object('added', v_added, 'ended', v_ended);
end;
$$;
comment on function private.apply_request_to_inventory(uuid) is 'Applies a closed request''s sections 5–7 to the person''s access inventory; returns {added, ended}.';

-- When a request closes (only through confirm_request), its lines reach the inventory.
create function private.inventory_on_close()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_counts jsonb;
begin
  v_counts := private.apply_request_to_inventory(new.id);
  if new.employee_id is not null then
    perform private.write_audit('inventory.updated', 'employee', new.employee_id::text,
      jsonb_build_object('request_id', new.id, 'ticket_id', new.ticket_id) || v_counts);
  end if;
  return null;
end;
$$;

create trigger requests_inventory_on_close after update of state on public.requests
for each row when (new.state = 'closed' and old.state is distinct from 'closed')
execute function private.inventory_on_close();

-- The inventory is written only by the functions above.
create function private.inventory_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'the access inventory is never deleted' using errcode = 'insufficient_privilege';
  end if;
  -- An ended row stays ended, and what was granted never changes.
  if old.ended_at is not null
     or (to_jsonb(new) - array['ended_at', 'ended_request_id', 'end_reason'])
        is distinct from (to_jsonb(old) - array['ended_at', 'ended_request_id', 'end_reason']) then
    raise exception 'inventory rows only end, once' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger inventory_guard before update or delete on public.employee_access_inventory
for each row execute function private.inventory_guard();

-- ---------------------------------------------------------------------------
-- 3. Back-fill from the requests already closed (oldest first)
-- ---------------------------------------------------------------------------
do $$
declare
  v_request record;
  v_counts jsonb;
begin
  for v_request in
    select id, ticket_id, employee_id from public.requests
    where state = 'closed' order by closed_at, ticket_year, ticket_number
  loop
    v_counts := private.apply_request_to_inventory(v_request.id);
    if v_request.employee_id is not null then
      perform private.write_audit('inventory.updated', 'employee', v_request.employee_id::text,
        jsonb_build_object('request_id', v_request.id, 'ticket_id', v_request.ticket_id, 'backfill', true)
          || v_counts);
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Row Level Security and grants (read only; nothing is auto-exposed)
-- ---------------------------------------------------------------------------
alter table public.employee_access_inventory enable row level security;

-- Same people who see employees: the IT side, approvers (reports) and auditors.
create policy "inventory: read with any role" on public.employee_access_inventory
for select to authenticated
using ((select private.has_any_role(array['admin', 'requester', 'it_operator', 'approver', 'auditor']::public.app_role[])));

revoke all on public.employee_access_inventory from anon, authenticated, service_role;
grant select on public.employee_access_inventory to authenticated, service_role;
grant usage on type public.inventory_kind to authenticated, service_role;

revoke all on function private.apply_request_to_inventory(uuid) from public;
revoke all on function private.inventory_on_close() from public;
revoke all on function private.inventory_guard() from public;

-- F10a-1 — Access modification: start one, link each change to what the
-- person holds (boards approved by Raju 2026-10-14).
--
-- A request of type access_modification stores ONLY THE CHANGES: a held item
-- that is kept has no row. A row that changes or removes something held
-- points to that inventory row (inventory_id), so "had X → now Y" is exact:
--   * application: Remove (permission = what they had, kept as it was), or a
--     hold action with a NEW permission (the same one = nothing to change);
--   * device: Return (type, asset tag and description from the inventory);
--   * access: Disable / Remove (scope = what they had), or a NEW scope.
-- A row without inventory_id adds something new; it can't repeat an app or
-- access type the person already holds (change that on its row instead).
-- The inventory itself changes only when the request closes (F09a trigger).

-- ---------------------------------------------------------------------------
-- 1. Links from a request row to the inventory row it changes
-- ---------------------------------------------------------------------------
alter table public.request_access_items
  add column inventory_id uuid references public.employee_access_inventory (id);
alter table public.request_equipment_items
  add column inventory_id uuid references public.employee_access_inventory (id);
alter table public.request_physical_access_items
  add column inventory_id uuid references public.employee_access_inventory (id);

comment on column public.request_access_items.inventory_id is 'Access modification: the held inventory row this line changes or removes (null = something new).';
comment on column public.request_equipment_items.inventory_id is 'Access modification: the held device this line returns (null = a new device).';
comment on column public.request_physical_access_items.inventory_id is 'Access modification: the held access this line changes or removes (null = new access).';

create unique index request_access_items_one_per_held on public.request_access_items (request_id, inventory_id)
  where inventory_id is not null;
create unique index request_equipment_items_one_per_held on public.request_equipment_items (request_id, inventory_id)
  where inventory_id is not null;
create unique index request_physical_items_one_per_held on public.request_physical_access_items (request_id, inventory_id)
  where inventory_id is not null;

-- ---------------------------------------------------------------------------
-- 2. Helpers
-- ---------------------------------------------------------------------------
-- The held inventory row a request line may point to, or an error.
create function private.held_item_for(p_request_id uuid, p_inventory_id uuid, p_kind public.inventory_kind)
returns public.employee_access_inventory
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_row public.employee_access_inventory;
begin
  if private.request_type_of(p_request_id) <> 'access_modification' then
    raise exception 'only an access change points to what the person holds' using errcode = 'check_violation';
  end if;
  select i.* into v_row
  from public.employee_access_inventory i
  join public.requests r on r.employee_id = i.employee_id
  where i.id = p_inventory_id and r.id = p_request_id and i.kind = p_kind and i.ended_at is null;
  if not found then
    raise exception 'that item is not held by this person any more — reload the request'
      using errcode = 'check_violation';
  end if;
  return v_row;
end;
$$;
comment on function private.held_item_for(uuid, uuid, public.inventory_kind) is 'The inventory row (of this kind, still held by the request''s person) an access-change line points to; raises otherwise.';

-- ---------------------------------------------------------------------------
-- 3. Row rules (copied from 20261014120000_multi_role.sql /
--    20261013150000_actions_by_type.sql; only the access-change parts added)
-- ---------------------------------------------------------------------------
create or replace function private.access_item_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_app public.catalog_apps;
  v_category text;
  v_offboarding boolean := private.request_is_offboarding(new.request_id);
  v_change boolean := private.request_type_of(new.request_id) = 'access_modification';
  v_held public.employee_access_inventory;
begin
  if tg_op = 'UPDATE' then
    if new.request_id is distinct from old.request_id
       or new.app_id is distinct from old.app_id
       or new.inventory_id is distinct from old.inventory_id then
      raise exception 'the request and the application of a row cannot change'
        using errcode = 'insufficient_privilege';
    end if;
    new.category_name := old.category_name;
    new.created_at := old.created_at;
    if new.app_id is not null then
      new.app_name := old.app_name;
    end if;
  else
    new.created_at := now();
  end if;
  new.updated_at := now();

  if v_offboarding and new.action <> 'Remove' then
    raise exception 'an offboarding only removes applications' using errcode = 'check_violation';
  end if;
  if private.request_type_of(new.request_id) = 'onboarding' and new.action not in ('Grant', 'Enroll') then
    raise exception 'an onboarding only grants applications (Grant, or Enroll for devices)' using errcode = 'check_violation';
  end if;

  -- Access change: a line about something held points to it.
  if new.inventory_id is not null then
    v_held := private.held_item_for(new.request_id, new.inventory_id, 'application');
    if v_held.app_id is distinct from new.app_id
       or (new.app_id is null and lower(v_held.name) <> lower(trim(new.app_name))) then
      raise exception 'that line is about another application' using errcode = 'check_violation';
    end if;
  elsif v_change and exists (
      select 1 from public.employee_access_inventory i
      join public.requests r on r.employee_id = i.employee_id
      where r.id = new.request_id and i.kind = 'application' and i.ended_at is null
        and case when new.app_id is not null then i.app_id = new.app_id
                 else i.app_id is null and lower(i.name) = lower(trim(new.app_name)) end) then
    raise exception 'the person already has this application — change it on its row'
      using errcode = 'check_violation';
  end if;

  if new.app_id is null then
    new.category_name := 'Other';
    new.app_name := trim(new.app_name);
    if new.action not in ('Grant', 'Modify', 'Remove') then
      raise exception 'action % is not allowed for other applications', new.action
        using errcode = 'check_violation';
    end if;
    if new.inventory_id is not null and new.action = 'Remove' then
      new.permission := v_held.permission;
    elsif new.inventory_id is not null and new.permission is not distinct from v_held.permission then
      raise exception 'that is the permission the person has today — nothing to change'
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  select a.* into v_app from public.catalog_apps a where a.id = new.app_id;
  if tg_op = 'INSERT' then
    -- A leaver (or an access change) may still hold a retired application: it can always be removed.
    if not v_app.active and not v_offboarding and not (new.inventory_id is not null and new.action = 'Remove') then
      raise exception 'application % is retired', v_app.name
        using errcode = 'check_violation';
    end if;
    select c.name into v_category from public.catalog_categories c where c.id = v_app.category_id;
    new.app_name := v_app.name;
    new.category_name := v_category;
  end if;
  if v_offboarding then
    return new; -- Remove, with the permission the person had (even one no longer offered)
  end if;
  if new.inventory_id is not null and new.action = 'Remove' then
    new.permission := v_held.permission; -- what they had, even one no longer offered
    return new;
  end if;
  if not (new.action = any (v_app.actions)) then
    raise exception 'action % is not offered for %', new.action, v_app.name
      using errcode = 'check_violation';
  end if;
  new.permission := private.clean_permission(v_app, new.permission);
  if new.inventory_id is not null and new.permission is not distinct from v_held.permission then
    raise exception 'that is the permission the person has today — nothing to change'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create or replace function private.equipment_item_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type public.equipment_types;
  v_offboarding boolean := private.request_is_offboarding(new.request_id);
  v_held public.employee_access_inventory;
begin
  if tg_op = 'UPDATE' and (new.request_id is distinct from old.request_id
                           or new.inventory_id is distinct from old.inventory_id) then
    raise exception 'the request of a row cannot change' using errcode = 'insufficient_privilege';
  end if;
  -- Access change: returning a held device copies it from the inventory.
  if new.inventory_id is not null then
    v_held := private.held_item_for(new.request_id, new.inventory_id, 'equipment');
    if new.action <> 'Return' then
      raise exception 'a device the person has can only be returned' using errcode = 'check_violation';
    end if;
    new.type_id := v_held.equipment_type_id;
    new.asset_tag := v_held.asset_tag;
    new.description := v_held.description;
  end if;
  select t.* into v_type from public.equipment_types t where t.id = new.type_id;
  if tg_op = 'INSERT' or new.type_id is distinct from old.type_id then
    if not v_type.active and not v_offboarding and new.inventory_id is null then
      raise exception 'equipment type % is retired', v_type.name using errcode = 'check_violation';
    end if;
    new.type_name := v_type.name;
  else
    new.type_name := old.type_name;
  end if;
  new.description := nullif(trim(new.description), '');
  new.asset_tag := nullif(trim(new.asset_tag), '');
  if private.request_type_of(new.request_id) = 'onboarding' and new.action <> 'Issue' then
    raise exception 'an onboarding only issues equipment' using errcode = 'check_violation';
  end if;
  if v_offboarding then
    if new.action <> 'Return' then
      raise exception 'an offboarding only returns equipment' using errcode = 'check_violation';
    end if;
  elsif new.inventory_id is null then
    if not (new.action = any (v_type.actions)) then
      raise exception 'action % is not offered for %', new.action, v_type.name using errcode = 'check_violation';
    end if;
    if v_type.needs_description and new.description is null then
      raise exception '% needs a description', v_type.name using errcode = 'check_violation';
    end if;
  end if;
  new.created_at := case when tg_op = 'INSERT' then now() else old.created_at end;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.physical_item_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type public.physical_access_types;
  v_offboarding boolean := private.request_is_offboarding(new.request_id);
  v_change boolean := private.request_type_of(new.request_id) = 'access_modification';
  v_held public.employee_access_inventory;
begin
  if tg_op = 'UPDATE' and (new.request_id is distinct from old.request_id
                           or new.type_id is distinct from old.type_id
                           or new.inventory_id is distinct from old.inventory_id) then
    raise exception 'the request and the type of a row cannot change' using errcode = 'insufficient_privilege';
  end if;
  -- Access change: a line about held access points to it.
  if new.inventory_id is not null then
    v_held := private.held_item_for(new.request_id, new.inventory_id, 'access');
    if v_held.access_type_id <> new.type_id then
      raise exception 'that line is about another access type' using errcode = 'check_violation';
    end if;
  elsif v_change and exists (
      select 1 from public.employee_access_inventory i
      join public.requests r on r.employee_id = i.employee_id
      where r.id = new.request_id and i.kind = 'access' and i.ended_at is null
        and i.access_type_id = new.type_id) then
    raise exception 'the person already has this access — change it on its row'
      using errcode = 'check_violation';
  end if;
  select t.* into v_type from public.physical_access_types t where t.id = new.type_id;
  if tg_op = 'INSERT' then
    if not v_type.active and not v_offboarding
       and not (new.inventory_id is not null and new.action in ('Disable', 'Remove')) then
      raise exception 'access type % is retired', v_type.name using errcode = 'check_violation';
    end if;
    new.type_name := v_type.name;
  else
    new.type_name := old.type_name;
  end if;
  if private.request_type_of(new.request_id) = 'onboarding' and new.action <> 'Grant' then
    raise exception 'an onboarding only grants access' using errcode = 'check_violation';
  end if;
  if v_offboarding then
    if new.action not in ('Disable', 'Remove') then
      raise exception 'an offboarding only disables or removes access' using errcode = 'check_violation';
    end if;
  elsif new.inventory_id is not null and new.action in ('Disable', 'Remove') then
    new.scope := v_held.permission; -- what they had, even one no longer offered
  else
    if not (new.action = any (v_type.actions)) then
      raise exception 'action % is not offered for %', new.action, v_type.name using errcode = 'check_violation';
    end if;
    if new.scope is not null and not (new.scope = any (v_type.scopes)) then
      raise exception 'scope % is not offered for %', new.scope, v_type.name using errcode = 'check_violation';
    end if;
    if new.inventory_id is not null and new.scope is not distinct from v_held.permission then
      raise exception 'that is the scope the person has today — nothing to change'
        using errcode = 'check_violation';
    end if;
  end if;
  new.created_at := case when tg_op = 'INSERT' then now() else old.created_at end;
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Starting an access change ("Who is changing?")
-- ---------------------------------------------------------------------------
create function public.create_access_modification(p_employee_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user text := private.current_user_id();
  v_employee public.employees;
  v_last public.requests;
  v_open record;
  v_id uuid;
begin
  if v_user is null or not private.is_active_user()
     or not private.has_any_role(array['admin', 'requester']::public.app_role[]) then
    raise exception 'only the IT side starts an access change' using errcode = 'insufficient_privilege';
  end if;

  if p_employee_id is not null then
    select * into v_employee from public.employees where id = p_employee_id;
    if not found then
      raise exception 'person not found' using errcode = 'no_data_found';
    end if;
    -- One open access change per person, and none while they are leaving.
    select ticket_id, type into v_open from public.requests
    where employee_id = p_employee_id and type in ('access_modification', 'offboarding')
      and state in ('draft', 'in_execution', 'pending_confirmation', 'returned')
    order by type limit 1;
    if found then
      if v_open.type = 'offboarding' then
        raise exception 'this person is leaving — an offboarding is open (%)', v_open.ticket_id
          using errcode = 'check_violation';
      end if;
      raise exception 'an access change is already open for this person (%)', v_open.ticket_id
        using errcode = 'check_violation';
    end if;
    -- Section 2 from the person's latest closed request (editable: a new role).
    select * into v_last from public.requests
    where employee_id = p_employee_id and state = 'closed'
    order by closed_at desc limit 1;
  end if;

  insert into public.requests
    (created_by, type, first_name, last_name, work_email, job_title, department_id, country,
     manager_name, requestor_name)
  values
    (v_user, 'access_modification', coalesce(v_last.first_name, v_employee.first_name),
     coalesce(v_last.last_name, v_employee.last_name), v_employee.work_email, v_last.job_title,
     v_last.department_id, v_last.country, v_last.manager_name, v_last.requestor_name)
  returning id into v_id;

  perform private.write_audit('request.access_change_started', 'request', v_id::text,
    jsonb_build_object('employee_id', p_employee_id,
      'held', (select count(*) from public.employee_access_inventory
               where employee_id = p_employee_id and ended_at is null)));
  return v_id;
end;
$$;
comment on function public.create_access_modification(uuid) is 'IT side: new access-change draft for a person (or empty with null), section 2 from their last closed request; nothing pre-filled (kept = no line); one open per person, none while an offboarding is open; audited.';

-- ---------------------------------------------------------------------------
-- 5. Grants
-- ---------------------------------------------------------------------------
revoke all on function private.held_item_for(uuid, uuid, public.inventory_kind) from public;
revoke all on function public.create_access_modification(uuid) from public, anon;
grant execute on function public.create_access_modification(uuid) to authenticated;

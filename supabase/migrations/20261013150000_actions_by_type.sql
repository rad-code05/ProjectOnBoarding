-- Actions by request type (asked by Raju, 2026-10-13).
--
--   onboarding           applications Grant (Enroll for devices) · equipment Issue · access Grant
--   offboarding          applications Remove · equipment Return · access Disable / Remove (F09b-1)
--   access modification  everything the catalog item offers (F10)
--
-- The screens offer only these; the database refuses anything else on new
-- writes. Rows already saved keep their action until they are changed. Each
-- trigger function below is its current definition with only that rule added.

create function private.request_type_of(p_request_id uuid)
returns public.request_type
language sql
stable
security definer
set search_path = ''
as $$
  select type from public.requests where id = p_request_id;
$$;
revoke all on function private.request_type_of(uuid) from public;

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
begin
  if tg_op = 'UPDATE' then
    if new.request_id is distinct from old.request_id
       or new.app_id is distinct from old.app_id then
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

  if new.app_id is null then
    new.category_name := 'Other';
    new.app_name := trim(new.app_name);
    if new.action not in ('Grant', 'Modify', 'Remove') then
      raise exception 'action % is not allowed for other applications', new.action
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  select a.* into v_app from public.catalog_apps a where a.id = new.app_id;
  if tg_op = 'INSERT' then
    -- A leaver may still hold a retired application: it can always be removed.
    if not v_app.active and not v_offboarding then
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
  if not (new.action = any (v_app.actions)) then
    raise exception 'action % is not offered for %', new.action, v_app.name
      using errcode = 'check_violation';
  end if;
  if new.permission is not null and not (new.permission = any (v_app.permissions)) then
    raise exception 'permission % is not offered for %', new.permission, v_app.name
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
begin
  if tg_op = 'UPDATE' and new.request_id is distinct from old.request_id then
    raise exception 'the request of a row cannot change' using errcode = 'insufficient_privilege';
  end if;
  select t.* into v_type from public.equipment_types t where t.id = new.type_id;
  if tg_op = 'INSERT' or new.type_id is distinct from old.type_id then
    if not v_type.active and not v_offboarding then
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
  else
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
begin
  if tg_op = 'UPDATE' and (new.request_id is distinct from old.request_id
                           or new.type_id is distinct from old.type_id) then
    raise exception 'the request and the type of a row cannot change' using errcode = 'insufficient_privilege';
  end if;
  select t.* into v_type from public.physical_access_types t where t.id = new.type_id;
  if tg_op = 'INSERT' then
    if not v_type.active and not v_offboarding then
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
  else
    if not (new.action = any (v_type.actions)) then
      raise exception 'action % is not offered for %', new.action, v_type.name using errcode = 'check_violation';
    end if;
    if new.scope is not null and not (new.scope = any (v_type.scopes)) then
      raise exception 'scope % is not offered for %', new.scope, v_type.name using errcode = 'check_violation';
    end if;
  end if;
  new.created_at := case when tg_op = 'INSERT' then now() else old.created_at end;
  new.updated_at := now();
  return new;
end;
$$;

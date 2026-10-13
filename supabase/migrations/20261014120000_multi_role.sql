-- Several roles in one application row (Raju, 2026-10-14): in Google Cloud a
-- person often holds more than one role (Editor + Secret Manager Secret
-- Accessor + Cloud Run Admin). An app marked `multi_permission` accepts
-- several of its options at once, stored in the same text column as one value
-- "Editor; Secret Manager Secret Accessor; Cloud Run Admin" (catalog order,
-- no duplicates). Because it stays one text, the access inventory, snapshots,
-- the PDF and offboarding need no change.

-- ---------------------------------------------------------------------------
-- 1. The flag, and room for a few roles
-- ---------------------------------------------------------------------------
alter table public.catalog_apps
  add column multi_permission boolean not null default false;
comment on column public.catalog_apps.multi_permission is 'true = a row may hold several of the permission options at once, stored as "A; B; C".';

update public.catalog_apps set multi_permission = true where name = 'Google Cloud';

alter table public.request_access_items
  drop constraint request_access_items_permission_check,
  add constraint request_access_items_permission_check check (length(permission) <= 600);

-- ---------------------------------------------------------------------------
-- 2. Checking (and tidying) a permission against the app's options
-- ---------------------------------------------------------------------------
create function private.clean_permission(p_app public.catalog_apps, p_permission text)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_parts text[];
  v_part text;
begin
  if p_permission is null then
    return null;
  end if;
  if not p_app.multi_permission then
    if not (p_permission = any (p_app.permissions)) then
      raise exception 'permission % is not offered for %', p_permission, p_app.name
        using errcode = 'check_violation';
    end if;
    return p_permission;
  end if;

  select coalesce(array_agg(trim(x)) filter (where trim(x) <> ''), '{}') into v_parts
  from unnest(string_to_array(p_permission, ';')) as x;
  if cardinality(v_parts) = 0 then
    return null;
  end if;
  foreach v_part in array v_parts loop
    if not (v_part = any (p_app.permissions)) then
      raise exception 'permission % is not offered for %', v_part, p_app.name
        using errcode = 'check_violation';
    end if;
  end loop;
  if cardinality(v_parts) <> (select count(distinct x) from unnest(v_parts) as x) then
    raise exception 'a role is listed twice for %', p_app.name using errcode = 'check_violation';
  end if;
  -- Same order as the catalog, so the same roles always read the same.
  return (select string_agg(o.option, '; ' order by o.n)
          from unnest(p_app.permissions) with ordinality as o (option, n)
          where o.option = any (v_parts));
end;
$$;
comment on function private.clean_permission(public.catalog_apps, text) is 'One of the app''s permission options — or, for a multi_permission app, several as "A; B" (catalog order, no duplicates); raises otherwise.';

-- The row trigger, as in 20261013150000_actions_by_type.sql; only the last
-- check changed (it now goes through clean_permission).
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
  new.permission := private.clean_permission(v_app, new.permission);
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Admin: the flag is part of an application (audited like the rest)
-- ---------------------------------------------------------------------------
drop function public.admin_save_app(smallint, smallint, text, text[], text[]);

create function public.admin_save_app(
  p_id smallint,
  p_category_id smallint,
  p_name text,
  p_actions text[],
  p_permissions text[],
  p_multi_permission boolean default false
)
returns smallint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_actions text[];
  v_permissions text[];
  v_multi boolean := coalesce(p_multi_permission, false);
  v_before public.catalog_apps;
  v_id smallint;
  v_after jsonb;
begin
  perform private.require_admin();
  v_name := private.clean_name(p_name, 'an application');
  v_actions := private.clean_actions(p_actions, array['Grant', 'Modify', 'Remove', 'Enroll', 'Disable']);
  v_permissions := private.clean_options(p_permissions, 'permission options');
  if exists (select 1 from unnest(v_permissions) as x where x like '%;%') then
    raise exception 'a permission option cannot contain ";"' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.catalog_categories where id = p_category_id and active) then
    raise exception 'choose an active category' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.catalog_apps
             where lower(name) = lower(v_name) and id is distinct from p_id) then
    raise exception 'an application called % already exists', v_name using errcode = 'unique_violation';
  end if;
  v_after := jsonb_build_object('name', v_name, 'category_id', p_category_id,
    'actions', to_jsonb(v_actions), 'permissions', to_jsonb(v_permissions), 'multi_permission', v_multi);

  if p_id is null then
    insert into public.catalog_apps (category_id, name, actions, permissions, multi_permission, sort_order)
    values (p_category_id, v_name, v_actions, v_permissions, v_multi,
      (select coalesce(max(sort_order), 0) + 10 from public.catalog_apps where category_id = p_category_id))
    returning id into v_id;
    perform private.write_audit('catalog.app_added', 'catalog_app', v_id::text,
      jsonb_build_object('after', v_after));
  else
    select * into v_before from public.catalog_apps where id = p_id for update;
    if not found then
      raise exception 'unknown application' using errcode = 'no_data_found';
    end if;
    update public.catalog_apps set
      category_id = p_category_id,
      name = v_name,
      actions = v_actions,
      permissions = v_permissions,
      multi_permission = v_multi,
      sort_order = case when category_id = p_category_id then sort_order
        else (select coalesce(max(sort_order), 0) + 10 from public.catalog_apps a2
              where a2.category_id = p_category_id) end
    where id = p_id;
    v_id := p_id;
    if jsonb_build_object('name', v_before.name, 'category_id', v_before.category_id,
         'actions', to_jsonb(v_before.actions), 'permissions', to_jsonb(v_before.permissions),
         'multi_permission', v_before.multi_permission) <> v_after then
      perform private.write_audit('catalog.app_changed', 'catalog_app', v_id::text,
        jsonb_build_object(
          'before', jsonb_build_object('name', v_before.name, 'category_id', v_before.category_id,
            'actions', to_jsonb(v_before.actions), 'permissions', to_jsonb(v_before.permissions),
            'multi_permission', v_before.multi_permission),
          'after', v_after));
    end if;
  end if;
  return v_id;
end;
$$;
comment on function public.admin_save_app(smallint, smallint, text, text[], text[], boolean) is 'Admin: add (p_id null) or change an application — name, category, actions, permission options, several roles at once; audited catalog.app_added / catalog.app_changed.';

revoke all on function private.clean_permission(public.catalog_apps, text) from public;
revoke all on function public.admin_save_app(smallint, smallint, text, text[], text[], boolean) from public, anon;
grant execute on function public.admin_save_app(smallint, smallint, text, text[], text[], boolean) to authenticated;

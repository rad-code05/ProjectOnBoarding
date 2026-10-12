-- F19a: Admin · Applications, Equipment & access types — the database side.
--
-- The lists the request form uses (application catalog + categories,
-- equipment types, physical / logical access types) become editable by an
-- admin, only through these functions: add / change, retire / restore.
-- Nothing is ever deleted; retired items disappear from new requests, while
-- old requests and PDFs keep the names they copied at the time.
-- Every change is checked (names unique, ignoring case; options cleaned and
-- limited; actions from a fixed list per kind) and audited (catalog.*). The
-- Laine assistant will later suggest items that the admin accepts through
-- the same functions (F15/F16).

-- ---------------------------------------------------------------------------
-- 1. Helpers
-- ---------------------------------------------------------------------------
create function private.require_admin()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user text := private.current_user_id();
begin
  if v_user is null or not private.is_active_user()
     or not private.has_any_role(array['admin']::public.app_role[]) then
    raise exception 'only an admin changes the lists' using errcode = 'insufficient_privilege';
  end if;
  return v_user;
end;
$$;

-- A display name: trimmed, inner spaces collapsed, 1–80 characters.
create function private.clean_name(p_name text, p_label text)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_name text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
begin
  if v_name = '' or length(v_name) > 80 then
    raise exception '% needs a name of 1–80 characters', p_label using errcode = 'check_violation';
  end if;
  return v_name;
end;
$$;

-- Free options (permissions, scopes): trimmed, empty ones dropped, repeats
-- (ignoring case) dropped keeping the first, each ≤ 40 characters, 1–12.
create function private.clean_options(p_options text[], p_label text)
returns text[]
language plpgsql
stable
set search_path = ''
as $$
declare
  v_out text[] := '{}'::text[];
  v_item text;
begin
  foreach v_item in array coalesce(p_options, '{}') loop
    v_item := regexp_replace(trim(coalesce(v_item, '')), '\s+', ' ', 'g');
    continue when v_item = '';
    if length(v_item) > 40 then
      raise exception '% must be 40 characters or fewer: %', p_label, v_item using errcode = 'check_violation';
    end if;
    continue when exists (select 1 from unnest(v_out) o where lower(o) = lower(v_item));
    v_out := v_out || v_item;
  end loop;
  if cardinality(v_out) not between 1 and 12 then
    raise exception 'add 1–12 %', p_label using errcode = 'check_violation';
  end if;
  return v_out;
end;
$$;

-- Actions from a fixed list, kept in the list's order; at least one.
create function private.clean_actions(p_actions text[], p_allowed text[])
returns text[]
language plpgsql
stable
set search_path = ''
as $$
declare
  v_out text[];
begin
  if exists (select 1 from unnest(coalesce(p_actions, '{}')) a where a <> all (p_allowed)) then
    raise exception 'actions must be among: %', array_to_string(p_allowed, ', ') using errcode = 'check_violation';
  end if;
  select array_agg(a order by ord) into v_out
  from unnest(p_allowed) with ordinality as t (a, ord)
  where a = any (coalesce(p_actions, '{}'));
  if v_out is null then
    raise exception 'choose at least one action' using errcode = 'check_violation';
  end if;
  return v_out;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Categories
-- ---------------------------------------------------------------------------
create function public.admin_save_category(p_id smallint, p_name text)
returns smallint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_before public.catalog_categories;
  v_id smallint;
begin
  perform private.require_admin();
  v_name := private.clean_name(p_name, 'a category');
  if exists (select 1 from public.catalog_categories
             where lower(name) = lower(v_name) and id is distinct from p_id) then
    raise exception 'a category called % already exists', v_name using errcode = 'unique_violation';
  end if;
  if p_id is null then
    insert into public.catalog_categories (name, sort_order)
    values (v_name, (select coalesce(max(sort_order), 0) + 10 from public.catalog_categories))
    returning id into v_id;
    perform private.write_audit('catalog.category_added', 'catalog_category', v_id::text,
      jsonb_build_object('after', jsonb_build_object('name', v_name)));
  else
    select * into v_before from public.catalog_categories where id = p_id for update;
    if not found then
      raise exception 'unknown category' using errcode = 'no_data_found';
    end if;
    update public.catalog_categories set name = v_name where id = p_id;
    v_id := p_id;
    if v_before.name <> v_name then
      perform private.write_audit('catalog.category_changed', 'catalog_category', v_id::text,
        jsonb_build_object('before', jsonb_build_object('name', v_before.name),
                           'after', jsonb_build_object('name', v_name)));
    end if;
  end if;
  return v_id;
end;
$$;

create function public.admin_set_category_active(p_id smallint, p_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before public.catalog_categories;
begin
  perform private.require_admin();
  select * into v_before from public.catalog_categories where id = p_id for update;
  if not found then
    raise exception 'unknown category' using errcode = 'no_data_found';
  end if;
  if not p_active and exists (select 1 from public.catalog_apps where category_id = p_id and active) then
    raise exception 'move or retire its applications first' using errcode = 'check_violation';
  end if;
  if v_before.active = p_active then
    return;
  end if;
  update public.catalog_categories set active = p_active where id = p_id;
  perform private.write_audit(
    case when p_active then 'catalog.category_restored' else 'catalog.category_retired' end,
    'catalog_category', p_id::text, jsonb_build_object('name', v_before.name));
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Applications
-- ---------------------------------------------------------------------------
create function public.admin_save_app(
  p_id smallint,
  p_category_id smallint,
  p_name text,
  p_actions text[],
  p_permissions text[]
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
  v_before public.catalog_apps;
  v_id smallint;
  v_after jsonb;
begin
  perform private.require_admin();
  v_name := private.clean_name(p_name, 'an application');
  v_actions := private.clean_actions(p_actions, array['Grant', 'Modify', 'Remove', 'Enroll', 'Disable']);
  v_permissions := private.clean_options(p_permissions, 'permission options');
  if not exists (select 1 from public.catalog_categories where id = p_category_id and active) then
    raise exception 'choose an active category' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.catalog_apps
             where lower(name) = lower(v_name) and id is distinct from p_id) then
    raise exception 'an application called % already exists', v_name using errcode = 'unique_violation';
  end if;
  v_after := jsonb_build_object('name', v_name, 'category_id', p_category_id,
    'actions', to_jsonb(v_actions), 'permissions', to_jsonb(v_permissions));

  if p_id is null then
    insert into public.catalog_apps (category_id, name, actions, permissions, sort_order)
    values (p_category_id, v_name, v_actions, v_permissions,
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
      sort_order = case when category_id = p_category_id then sort_order
        else (select coalesce(max(sort_order), 0) + 10 from public.catalog_apps a2
              where a2.category_id = p_category_id) end
    where id = p_id;
    v_id := p_id;
    if jsonb_build_object('name', v_before.name, 'category_id', v_before.category_id,
         'actions', to_jsonb(v_before.actions), 'permissions', to_jsonb(v_before.permissions)) <> v_after then
      perform private.write_audit('catalog.app_changed', 'catalog_app', v_id::text,
        jsonb_build_object(
          'before', jsonb_build_object('name', v_before.name, 'category_id', v_before.category_id,
            'actions', to_jsonb(v_before.actions), 'permissions', to_jsonb(v_before.permissions)),
          'after', v_after));
    end if;
  end if;
  return v_id;
end;
$$;

create function public.admin_set_app_active(p_id smallint, p_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before public.catalog_apps;
begin
  perform private.require_admin();
  select * into v_before from public.catalog_apps where id = p_id for update;
  if not found then
    raise exception 'unknown application' using errcode = 'no_data_found';
  end if;
  if p_active and not exists (select 1 from public.catalog_categories
                              where id = v_before.category_id and active) then
    raise exception 'restore its category first' using errcode = 'check_violation';
  end if;
  if v_before.active = p_active then
    return;
  end if;
  update public.catalog_apps set active = p_active where id = p_id;
  perform private.write_audit(
    case when p_active then 'catalog.app_restored' else 'catalog.app_retired' end,
    'catalog_app', p_id::text, jsonb_build_object('name', v_before.name));
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Equipment types and physical / logical access types
-- ---------------------------------------------------------------------------
create function public.admin_save_equipment_type(
  p_id smallint,
  p_name text,
  p_actions text[],
  p_needs_description boolean
)
returns smallint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_actions text[];
  v_before public.equipment_types;
  v_id smallint;
  v_after jsonb;
begin
  perform private.require_admin();
  v_name := private.clean_name(p_name, 'an equipment type');
  v_actions := private.clean_actions(p_actions, array['Issue', 'Return']);
  if exists (select 1 from public.equipment_types
             where lower(name) = lower(v_name) and id is distinct from p_id) then
    raise exception 'an equipment type called % already exists', v_name using errcode = 'unique_violation';
  end if;
  v_after := jsonb_build_object('name', v_name, 'actions', to_jsonb(v_actions),
    'needs_description', coalesce(p_needs_description, false));
  if p_id is null then
    insert into public.equipment_types (name, actions, needs_description, sort_order)
    values (v_name, v_actions, coalesce(p_needs_description, false),
      (select coalesce(max(sort_order), 0) + 10 from public.equipment_types))
    returning id into v_id;
    perform private.write_audit('catalog.equipment_type_added', 'equipment_type', v_id::text,
      jsonb_build_object('after', v_after));
  else
    select * into v_before from public.equipment_types where id = p_id for update;
    if not found then
      raise exception 'unknown equipment type' using errcode = 'no_data_found';
    end if;
    update public.equipment_types set name = v_name, actions = v_actions,
      needs_description = coalesce(p_needs_description, false)
    where id = p_id;
    v_id := p_id;
    if jsonb_build_object('name', v_before.name, 'actions', to_jsonb(v_before.actions),
         'needs_description', v_before.needs_description) <> v_after then
      perform private.write_audit('catalog.equipment_type_changed', 'equipment_type', v_id::text,
        jsonb_build_object(
          'before', jsonb_build_object('name', v_before.name, 'actions', to_jsonb(v_before.actions),
            'needs_description', v_before.needs_description),
          'after', v_after));
    end if;
  end if;
  return v_id;
end;
$$;

create function public.admin_set_equipment_type_active(p_id smallint, p_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before public.equipment_types;
begin
  perform private.require_admin();
  select * into v_before from public.equipment_types where id = p_id for update;
  if not found then
    raise exception 'unknown equipment type' using errcode = 'no_data_found';
  end if;
  if v_before.active = p_active then
    return;
  end if;
  update public.equipment_types set active = p_active where id = p_id;
  perform private.write_audit(
    case when p_active then 'catalog.equipment_type_restored' else 'catalog.equipment_type_retired' end,
    'equipment_type', p_id::text, jsonb_build_object('name', v_before.name));
end;
$$;

create function public.admin_save_access_type(
  p_id smallint,
  p_name text,
  p_actions text[],
  p_scopes text[]
)
returns smallint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_actions text[];
  v_scopes text[];
  v_before public.physical_access_types;
  v_id smallint;
  v_after jsonb;
begin
  perform private.require_admin();
  v_name := private.clean_name(p_name, 'an access type');
  v_actions := private.clean_actions(p_actions, array['Grant', 'Modify', 'Remove', 'Disable']);
  v_scopes := private.clean_options(p_scopes, 'scopes');
  if exists (select 1 from public.physical_access_types
             where lower(name) = lower(v_name) and id is distinct from p_id) then
    raise exception 'an access type called % already exists', v_name using errcode = 'unique_violation';
  end if;
  v_after := jsonb_build_object('name', v_name, 'actions', to_jsonb(v_actions), 'scopes', to_jsonb(v_scopes));
  if p_id is null then
    insert into public.physical_access_types (name, actions, scopes, sort_order)
    values (v_name, v_actions, v_scopes,
      (select coalesce(max(sort_order), 0) + 10 from public.physical_access_types))
    returning id into v_id;
    perform private.write_audit('catalog.access_type_added', 'access_type', v_id::text,
      jsonb_build_object('after', v_after));
  else
    select * into v_before from public.physical_access_types where id = p_id for update;
    if not found then
      raise exception 'unknown access type' using errcode = 'no_data_found';
    end if;
    update public.physical_access_types set name = v_name, actions = v_actions, scopes = v_scopes
    where id = p_id;
    v_id := p_id;
    if jsonb_build_object('name', v_before.name, 'actions', to_jsonb(v_before.actions),
         'scopes', to_jsonb(v_before.scopes)) <> v_after then
      perform private.write_audit('catalog.access_type_changed', 'access_type', v_id::text,
        jsonb_build_object(
          'before', jsonb_build_object('name', v_before.name, 'actions', to_jsonb(v_before.actions),
            'scopes', to_jsonb(v_before.scopes)),
          'after', v_after));
    end if;
  end if;
  return v_id;
end;
$$;

create function public.admin_set_access_type_active(p_id smallint, p_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before public.physical_access_types;
begin
  perform private.require_admin();
  select * into v_before from public.physical_access_types where id = p_id for update;
  if not found then
    raise exception 'unknown access type' using errcode = 'no_data_found';
  end if;
  if v_before.active = p_active then
    return;
  end if;
  update public.physical_access_types set active = p_active where id = p_id;
  perform private.write_audit(
    case when p_active then 'catalog.access_type_restored' else 'catalog.access_type_retired' end,
    'access_type', p_id::text, jsonb_build_object('name', v_before.name));
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Grants (tables stay read-only for users; only these functions write)
-- ---------------------------------------------------------------------------
revoke all on function private.require_admin() from public;
revoke all on function private.clean_name(text, text) from public;
revoke all on function private.clean_options(text[], text) from public;
revoke all on function private.clean_actions(text[], text[]) from public;

revoke all on function public.admin_save_category(smallint, text) from public, anon;
revoke all on function public.admin_set_category_active(smallint, boolean) from public, anon;
revoke all on function public.admin_save_app(smallint, smallint, text, text[], text[]) from public, anon;
revoke all on function public.admin_set_app_active(smallint, boolean) from public, anon;
revoke all on function public.admin_save_equipment_type(smallint, text, text[], boolean) from public, anon;
revoke all on function public.admin_set_equipment_type_active(smallint, boolean) from public, anon;
revoke all on function public.admin_save_access_type(smallint, text, text[], text[]) from public, anon;
revoke all on function public.admin_set_access_type_active(smallint, boolean) from public, anon;
grant execute on function public.admin_save_category(smallint, text) to authenticated;
grant execute on function public.admin_set_category_active(smallint, boolean) to authenticated;
grant execute on function public.admin_save_app(smallint, smallint, text, text[], text[]) to authenticated;
grant execute on function public.admin_set_app_active(smallint, boolean) to authenticated;
grant execute on function public.admin_save_equipment_type(smallint, text, text[], boolean) to authenticated;
grant execute on function public.admin_set_equipment_type_active(smallint, boolean) to authenticated;
grant execute on function public.admin_save_access_type(smallint, text, text[], text[]) to authenticated;
grant execute on function public.admin_set_access_type_active(smallint, boolean) to authenticated;

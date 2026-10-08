-- F03a — Equipment (section 6) and physical & logical access (section 7).
--
-- Same rules as F02a: the types are DATA (admin-editable in F19), each
-- request row keeps a copy of the type name, actions/scopes are checked
-- against the type's own options, rows change only while the request is
-- open, and every add / change / removal is audited.
--
--   * Equipment: several items per request (two laptops are possible).
--     Types with needs_description (Other) require a description.
--   * Physical & logical access: at most one row per type per request,
--     like the application matrix.

-- ---------------------------------------------------------------------------
-- 1. Types (form v4 seed)
-- ---------------------------------------------------------------------------
create table public.equipment_types (
  id smallint generated always as identity primary key,
  name text not null unique check (length(trim(name)) > 0),
  actions text[] not null default '{Issue,Return}' check (cardinality(actions) > 0),
  needs_description boolean not null default false,
  sort_order smallint not null default 0,
  active boolean not null default true
);
comment on table public.equipment_types is 'Section 6 equipment types (data, not code). Retired with active = false, never deleted. Admin screen: F19.';

insert into public.equipment_types (name, needs_description, sort_order) values
  ('Laptop · Windows', false, 10),
  ('Laptop · macOS', false, 20),
  ('Mobile phone', false, 30),
  ('Other', true, 40);

create table public.physical_access_types (
  id smallint generated always as identity primary key,
  name text not null unique check (length(trim(name)) > 0),
  actions text[] not null check (cardinality(actions) > 0),
  scopes text[] not null check (cardinality(scopes) > 0),
  sort_order smallint not null default 0,
  active boolean not null default true
);
comment on table public.physical_access_types is 'Section 7 physical & logical access types with their own actions and scopes (data, not code). Admin screen: F19.';

insert into public.physical_access_types (name, actions, scopes, sort_order) values
  ('Office access', '{Grant,Disable}', '{Badge,Key}', 10),
  ('VPN / secure access', '{Grant,Disable}', '{Corporate VPN}', 20),
  ('Shared drives', '{Grant,Modify,Remove}', '{Department,Project}', 30);

-- ---------------------------------------------------------------------------
-- 2. Request rows
-- ---------------------------------------------------------------------------
create table public.request_equipment_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests (id),
  type_id smallint not null references public.equipment_types (id),
  type_name text not null, -- snapshot, set by the database
  action text not null,
  description text check (length(description) <= 120),
  asset_tag text check (length(asset_tag) <= 80),
  notes text check (length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.request_equipment_items is 'Section 6: equipment issued or returned on a request (several allowed), with a snapshot of the type name.';
create index request_equipment_items_request_idx on public.request_equipment_items (request_id);

create table public.request_physical_access_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests (id),
  type_id smallint not null references public.physical_access_types (id),
  type_name text not null, -- snapshot, set by the database
  action text not null,
  scope text,
  notes text check (length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (request_id, type_id)
);
comment on table public.request_physical_access_items is 'Section 7: one row per physical/logical access type on a request, with a snapshot of the type name.';
create index request_physical_access_items_request_idx on public.request_physical_access_items (request_id);

-- ---------------------------------------------------------------------------
-- 3. Checks, snapshots, timestamps
-- ---------------------------------------------------------------------------
create function private.equipment_item_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type public.equipment_types;
begin
  if tg_op = 'UPDATE' and new.request_id is distinct from old.request_id then
    raise exception 'the request of a row cannot change' using errcode = 'insufficient_privilege';
  end if;
  select t.* into v_type from public.equipment_types t where t.id = new.type_id;
  if tg_op = 'INSERT' or new.type_id is distinct from old.type_id then
    if not v_type.active then
      raise exception 'equipment type % is retired', v_type.name using errcode = 'check_violation';
    end if;
    new.type_name := v_type.name;
  else
    new.type_name := old.type_name;
  end if;
  new.description := nullif(trim(new.description), '');
  new.asset_tag := nullif(trim(new.asset_tag), '');
  if not (new.action = any (v_type.actions)) then
    raise exception 'action % is not offered for %', new.action, v_type.name using errcode = 'check_violation';
  end if;
  if v_type.needs_description and new.description is null then
    raise exception '% needs a description', v_type.name using errcode = 'check_violation';
  end if;
  new.created_at := case when tg_op = 'INSERT' then now() else old.created_at end;
  new.updated_at := now();
  return new;
end;
$$;
create trigger request_equipment_items_before_write
before insert or update on public.request_equipment_items
for each row execute function private.equipment_item_before_write();

create function private.physical_item_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type public.physical_access_types;
begin
  if tg_op = 'UPDATE' and (new.request_id is distinct from old.request_id
                           or new.type_id is distinct from old.type_id) then
    raise exception 'the request and the type of a row cannot change' using errcode = 'insufficient_privilege';
  end if;
  select t.* into v_type from public.physical_access_types t where t.id = new.type_id;
  if tg_op = 'INSERT' then
    if not v_type.active then
      raise exception 'access type % is retired', v_type.name using errcode = 'check_violation';
    end if;
    new.type_name := v_type.name;
  else
    new.type_name := old.type_name;
  end if;
  if not (new.action = any (v_type.actions)) then
    raise exception 'action % is not offered for %', new.action, v_type.name using errcode = 'check_violation';
  end if;
  if new.scope is not null and not (new.scope = any (v_type.scopes)) then
    raise exception 'scope % is not offered for %', new.scope, v_type.name using errcode = 'check_violation';
  end if;
  new.created_at := case when tg_op = 'INSERT' then now() else old.created_at end;
  new.updated_at := now();
  return new;
end;
$$;
create trigger request_physical_access_items_before_write
before insert or update on public.request_physical_access_items
for each row execute function private.physical_item_before_write();

-- ---------------------------------------------------------------------------
-- 4. Audit
-- ---------------------------------------------------------------------------
create function private.audit_equipment_items()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.request_equipment_items := case when tg_op = 'DELETE' then old else new end;
  v_value jsonb := jsonb_build_object(
    'type', v_row.type_name, 'action', v_row.action, 'description', v_row.description,
    'asset_tag', v_row.asset_tag, 'notes', v_row.notes);
begin
  if tg_op = 'INSERT' then
    perform private.write_audit('request.equipment_added', 'request', v_row.request_id::text, v_value);
  elsif tg_op = 'DELETE' then
    perform private.write_audit('request.equipment_removed', 'request', v_row.request_id::text, v_value);
  elsif (old.type_id, old.action, old.description, old.asset_tag, old.notes)
        is distinct from (new.type_id, new.action, new.description, new.asset_tag, new.notes) then
    perform private.write_audit('request.equipment_changed', 'request', v_row.request_id::text,
      jsonb_build_object(
        'before', jsonb_build_object('type', old.type_name, 'action', old.action, 'description', old.description,
                                     'asset_tag', old.asset_tag, 'notes', old.notes),
        'after', v_value));
  end if;
  return null;
end;
$$;
create trigger request_equipment_items_audit
after insert or update or delete on public.request_equipment_items
for each row execute function private.audit_equipment_items();

create function private.audit_physical_items()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.request_physical_access_items := case when tg_op = 'DELETE' then old else new end;
  v_value jsonb := jsonb_build_object(
    'type', v_row.type_name, 'action', v_row.action, 'scope', v_row.scope, 'notes', v_row.notes);
begin
  if tg_op = 'INSERT' then
    perform private.write_audit('request.physical_added', 'request', v_row.request_id::text, v_value);
  elsif tg_op = 'DELETE' then
    perform private.write_audit('request.physical_removed', 'request', v_row.request_id::text, v_value);
  elsif (old.action, old.scope, old.notes) is distinct from (new.action, new.scope, new.notes) then
    perform private.write_audit('request.physical_changed', 'request', v_row.request_id::text,
      jsonb_build_object(
        'before', jsonb_build_object('type', old.type_name, 'action', old.action, 'scope', old.scope, 'notes', old.notes),
        'after', v_value));
  end if;
  return null;
end;
$$;
create trigger request_physical_access_items_audit
after insert or update or delete on public.request_physical_access_items
for each row execute function private.audit_physical_items();

-- ---------------------------------------------------------------------------
-- 5. Row Level Security
-- ---------------------------------------------------------------------------
-- True when the caller is on the IT side and the request is still open.
-- Runs as the caller, so the requests policies apply inside it.
create function private.can_edit_request_items(p_request_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select private.has_any_role(array['admin', 'requester', 'it_operator']::public.app_role[])
     and exists (select 1 from public.requests r
                 where r.id = p_request_id and r.state in ('draft', 'in_execution', 'returned'))
$$;

alter table public.equipment_types enable row level security;
alter table public.physical_access_types enable row level security;
alter table public.request_equipment_items enable row level security;
alter table public.request_physical_access_items enable row level security;

create policy "equipment_types: active users read" on public.equipment_types
for select to authenticated using ((select private.is_active_user()));
create policy "physical_access_types: active users read" on public.physical_access_types
for select to authenticated using ((select private.is_active_user()));

create policy "request_equipment_items: visible with their request" on public.request_equipment_items
for select to authenticated
using (exists (select 1 from public.requests r where r.id = request_id));
create policy "request_equipment_items: IT side adds to open requests" on public.request_equipment_items
for insert to authenticated with check (private.can_edit_request_items(request_id));
create policy "request_equipment_items: IT side changes open requests" on public.request_equipment_items
for update to authenticated
using (private.can_edit_request_items(request_id))
with check (private.can_edit_request_items(request_id));
create policy "request_equipment_items: IT side removes from open requests" on public.request_equipment_items
for delete to authenticated using (private.can_edit_request_items(request_id));

create policy "request_physical_access_items: visible with their request" on public.request_physical_access_items
for select to authenticated
using (exists (select 1 from public.requests r where r.id = request_id));
create policy "request_physical_access_items: IT side adds to open requests" on public.request_physical_access_items
for insert to authenticated with check (private.can_edit_request_items(request_id));
create policy "request_physical_access_items: IT side changes open requests" on public.request_physical_access_items
for update to authenticated
using (private.can_edit_request_items(request_id))
with check (private.can_edit_request_items(request_id));
create policy "request_physical_access_items: IT side removes from open requests" on public.request_physical_access_items
for delete to authenticated using (private.can_edit_request_items(request_id));

-- ---------------------------------------------------------------------------
-- 6. Grants
-- ---------------------------------------------------------------------------
revoke all on public.equipment_types, public.physical_access_types,
  public.request_equipment_items, public.request_physical_access_items
  from anon, authenticated, service_role;
revoke all on function private.can_edit_request_items(uuid) from public;
grant execute on function private.can_edit_request_items(uuid) to authenticated;

grant select on public.equipment_types, public.physical_access_types to authenticated;
grant select, insert, update, delete on public.request_equipment_items,
  public.request_physical_access_items to authenticated;

grant select on public.equipment_types, public.physical_access_types,
  public.request_equipment_items, public.request_physical_access_items to service_role;

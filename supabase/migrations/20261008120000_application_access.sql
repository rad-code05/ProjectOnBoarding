-- F02a — Application catalog (26 apps of form v4) and each request's
-- application access rows (section 5).
--
-- Same rules as before: RLS on every table, explicit grants only, helpers in
-- `private`, timestamps and checks in the database, every change audited.
--
--   * The catalog is DATA: categories and apps, each app with its OWN actions
--     (Hexnode: Enroll / Remove) and permission options. Admin screens arrive
--     in F19; until then the catalog changes only through migrations.
--   * A request row keeps a COPY of the app's name and category at the time
--     (snapshot), so renaming or retiring an app never changes old records.
--   * Retired apps (active = false) can't be added to new rows; old rows stay.
--   * "Other" apps (app_id null) are one-off tools typed on the request.
--   * Rows can be removed while the request is open ("Clear"); the removal is
--     audited. Each row saves on its own (no request version bump), so the
--     form's autosave of sections 1–2 is not disturbed by app changes.

-- ---------------------------------------------------------------------------
-- 1. Catalog
-- ---------------------------------------------------------------------------
create table public.catalog_categories (
  id smallint generated always as identity primary key,
  name text not null unique check (length(trim(name)) > 0),
  sort_order smallint not null default 0,
  active boolean not null default true
);
comment on table public.catalog_categories is 'Application catalog categories (data, not code). Retired with active = false, never deleted.';

create table public.catalog_apps (
  id smallint generated always as identity primary key,
  category_id smallint not null references public.catalog_categories (id),
  name text not null unique check (length(trim(name)) > 0),
  actions text[] not null check (cardinality(actions) > 0),
  permissions text[] not null check (cardinality(permissions) > 0),
  sort_order smallint not null default 0,
  active boolean not null default true
);
comment on table public.catalog_apps is 'Applications in the access matrix, each with its own actions and permission options. Retired with active = false, never deleted.';
create index catalog_apps_category_idx on public.catalog_apps (category_id);

insert into public.catalog_categories (name, sort_order) values
  ('Core business', 10),
  ('Engineering, cloud & data', 20),
  ('Security, device & identity', 30),
  ('Business, finance & operations', 40);

-- Form v4 seed (PROJECT_PLAN §4.2).
insert into public.catalog_apps (category_id, name, actions, permissions, sort_order)
select c.id, a.name, a.actions, a.permissions, a.sort_order
from (values
  ('Core business', 'Office 365',        '{Grant,Modify,Remove}'::text[], '{User,Admin}'::text[],              10),
  ('Core business', 'Google Workspace',  '{Grant,Modify,Remove}',         '{User,Admin}',                      20),
  ('Core business', 'Slack',             '{Grant,Modify,Remove}',         '{Member,Admin}',                    30),
  ('Core business', 'GitHub',            '{Grant,Modify,Remove}',         '{Read,Write,Admin}',                40),
  ('Core business', 'Monday.com',        '{Grant,Modify,Remove}',         '{User,Admin}',                      50),
  ('Core business', 'Trello',            '{Grant,Modify,Remove}',         '{Member,Admin}',                    60),
  ('Core business', 'Siteground',        '{Grant,Modify,Remove}',         '{Member,Admin}',                    70),
  ('Core business', 'Figma',             '{Grant,Modify,Remove}',         '{Viewer,Editor,Admin}',             80),
  ('Engineering, cloud & data', 'Google Cloud', '{Grant,Modify,Remove}',  '{Viewer,Editor,Admin}',             10),
  ('Engineering, cloud & data', 'Firebase',     '{Grant,Modify,Remove}',  '{Viewer,Editor,Admin}',             20),
  ('Engineering, cloud & data', 'Supabase',     '{Grant,Modify,Remove}',  '{Read,Write,Admin}',                30),
  ('Engineering, cloud & data', 'MongoDB',      '{Grant,Modify,Remove}',  '{Read,Write,Admin}',                40),
  ('Engineering, cloud & data', 'LangFuse',     '{Grant,Modify,Remove}',  '{Read,Write,Admin}',                50),
  ('Engineering, cloud & data', 'OpenRouter',   '{Grant,Modify,Remove}',  '{Read,Write,Admin}',                60),
  ('Engineering, cloud & data', 'Cloudflare',   '{Grant,Modify,Remove}',  '{DNS,Security,Admin}',              70),
  ('Security, device & identity', 'Hexnode (MDM)',  '{Enroll,Remove}',       '{Device,Admin}',                10),
  ('Security, device & identity', 'Sophos Central', '{Grant,Modify,Remove}', '{User,Admin}',                  20),
  ('Security, device & identity', 'Vouch',          '{Grant,Modify,Remove}', '{User,Admin}',                  30),
  ('Security, device & identity', 'SecureFrame',    '{Grant,Modify,Remove}', '{User,Admin}',                  40),
  ('Business, finance & operations', 'Payrexx',    '{Grant,Modify,Remove}', '{Finance,Admin}',                10),
  ('Business, finance & operations', 'Deel',       '{Grant,Modify,Remove}', '{User,Admin}',                   20),
  ('Business, finance & operations', 'Mixpanel',   '{Grant,Modify,Remove}', '{Viewer,Analyst,Admin}',         30),
  ('Business, finance & operations', 'Locize',     '{Grant,Modify,Remove}', '{User,Admin}',                   40),
  ('Business, finance & operations', 'resend.com', '{Grant,Modify,Remove}', '{API,Admin}',                    50),
  ('Business, finance & operations', 'Clay',       '{Grant,Modify,Remove}', '{User,Admin}',                   60),
  ('Business, finance & operations', 'HubSpot',    '{Grant,Modify,Remove}', '{User,Admin}',                   70)
) as a (category, name, actions, permissions, sort_order)
join public.catalog_categories c on c.name = a.category;

-- ---------------------------------------------------------------------------
-- 2. A request's application access rows (section 5)
-- ---------------------------------------------------------------------------
create table public.request_access_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests (id),
  -- null = an "Other" app typed on this request.
  app_id smallint references public.catalog_apps (id),
  -- Snapshot of the catalog at the time (set by the database for catalog apps).
  category_name text not null,
  app_name text not null check (length(trim(app_name)) between 1 and 80),
  action text not null,
  permission text check (length(permission) <= 80),
  notes text check (length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.request_access_items is 'Section 5: one row per application on a request, with a snapshot of the app name/category. Removed only while the request is open (audited).';
create index request_access_items_request_idx on public.request_access_items (request_id);
create unique index request_access_items_one_per_app
  on public.request_access_items (request_id, app_id) where app_id is not null;
create unique index request_access_items_one_per_other
  on public.request_access_items (request_id, lower(app_name)) where app_id is null;

-- Checks the action/permission against the app's own options, fills the
-- snapshot, keeps the request and app fixed, sets server timestamps.
create function private.access_item_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_app public.catalog_apps;
  v_category text;
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
    if not v_app.active then
      raise exception 'application % is retired', v_app.name
        using errcode = 'check_violation';
    end if;
    select c.name into v_category from public.catalog_categories c where c.id = v_app.category_id;
    new.app_name := v_app.name;
    new.category_name := v_category;
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
create trigger request_access_items_before_write
before insert or update on public.request_access_items
for each row execute function private.access_item_before_write();

create function private.audit_access_items()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.request_access_items := case when tg_op = 'DELETE' then old else new end;
  v_value jsonb := jsonb_build_object(
    'app', v_row.app_name, 'action', v_row.action,
    'permission', v_row.permission, 'notes', v_row.notes);
begin
  if tg_op = 'INSERT' then
    perform private.write_audit('request.access_added', 'request', v_row.request_id::text, v_value);
  elsif tg_op = 'DELETE' then
    perform private.write_audit('request.access_removed', 'request', v_row.request_id::text, v_value);
  elsif (old.action, old.permission, old.notes) is distinct from (new.action, new.permission, new.notes) then
    perform private.write_audit('request.access_changed', 'request', v_row.request_id::text,
      jsonb_build_object('app', new.app_name,
        'before', jsonb_build_object('action', old.action, 'permission', old.permission, 'notes', old.notes),
        'after', jsonb_build_object('action', new.action, 'permission', new.permission, 'notes', new.notes)));
  end if;
  return null;
end;
$$;
create trigger request_access_items_audit
after insert or update or delete on public.request_access_items
for each row execute function private.audit_access_items();

-- ---------------------------------------------------------------------------
-- 3. Row Level Security
-- ---------------------------------------------------------------------------
alter table public.catalog_categories enable row level security;
alter table public.catalog_apps enable row level security;
alter table public.request_access_items enable row level security;

create policy "catalog_categories: active users read" on public.catalog_categories
for select to authenticated using ((select private.is_active_user()));
create policy "catalog_apps: active users read" on public.catalog_apps
for select to authenticated using ((select private.is_active_user()));

-- Rows are visible exactly when their request is (the requests policies apply
-- inside the subquery): approvers never see drafts' apps either.
create policy "request_access_items: visible with their request" on public.request_access_items
for select to authenticated
using (exists (select 1 from public.requests r where r.id = request_id));

create policy "request_access_items: IT side adds to open requests" on public.request_access_items
for insert to authenticated
with check (
  (select private.has_any_role(array['admin', 'requester', 'it_operator']::public.app_role[]))
  and exists (select 1 from public.requests r
              where r.id = request_id and r.state in ('draft', 'in_execution', 'returned'))
);

create policy "request_access_items: IT side changes open requests" on public.request_access_items
for update to authenticated
using (
  (select private.has_any_role(array['admin', 'requester', 'it_operator']::public.app_role[]))
  and exists (select 1 from public.requests r
              where r.id = request_id and r.state in ('draft', 'in_execution', 'returned'))
)
with check (
  (select private.has_any_role(array['admin', 'requester', 'it_operator']::public.app_role[]))
);

create policy "request_access_items: IT side removes from open requests" on public.request_access_items
for delete to authenticated
using (
  (select private.has_any_role(array['admin', 'requester', 'it_operator']::public.app_role[]))
  and exists (select 1 from public.requests r
              where r.id = request_id and r.state in ('draft', 'in_execution', 'returned'))
);

-- ---------------------------------------------------------------------------
-- 4. Grants
-- ---------------------------------------------------------------------------
revoke all on public.catalog_categories, public.catalog_apps, public.request_access_items
  from anon, authenticated, service_role;

grant select on public.catalog_categories, public.catalog_apps to authenticated;
grant select, insert, update, delete on public.request_access_items to authenticated;

grant select on public.catalog_categories, public.catalog_apps, public.request_access_items
  to service_role;

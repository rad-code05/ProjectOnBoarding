-- S6 — Users, roles and the append-only audit log.
--
-- Identity comes from Clerk: every request carries a Clerk session token whose
-- `sub` claim is the Clerk user ID (text, e.g. "user_2abc…"), read with
-- auth.jwt() ->> 'sub'. Supabase Auth (auth.users / auth.uid()) is not used.
--
-- Security model
--   * Row Level Security (RLS) on every table; the Data API exposes only what
--     is granted here (new tables are never exposed by default).
--   * Helper functions live in the non-exposed `private` schema.
--   * Timestamps are always set by the database (never backdated).
--   * audit_events is append-only: no role can update or delete rows.
--   * Every change to users and roles is written to the audit log by triggers.

-- ---------------------------------------------------------------------------
-- 0. Data API: nothing is exposed unless a migration grants it.
-- ---------------------------------------------------------------------------
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated, public;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 1. Types
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('admin', 'requester', 'it_operator', 'approver', 'auditor');
create type public.audit_source as enum ('user', 'ai', 'system');

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------
create table public.app_users (
  clerk_user_id text primary key check (clerk_user_id ~ '^user_\w+$'),
  email text not null check (email = lower(email) and email like '%_@_%'),
  first_name text,
  last_name text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.app_users is 'People who can sign in (mirrors Clerk users; synced by the Clerk webhook). Never deleted — deactivated.';

-- One active account per email (a removed user may be re-invited with a new Clerk ID).
create unique index app_users_active_email_key on public.app_users (email) where active;

create table public.user_roles (
  clerk_user_id text not null references public.app_users (clerk_user_id) on delete cascade,
  role public.app_role not null,
  granted_at timestamptz not null default now(),
  granted_by text references public.app_users (clerk_user_id),
  primary key (clerk_user_id, role),
  -- Segregation of duties: nobody grants a role to themselves.
  constraint user_roles_no_self_grant check (granted_by is distinct from clerk_user_id)
);
comment on table public.user_roles is 'Roles per user (a user can hold several). granted_by is null for system/bootstrap grants.';

create table public.audit_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  actor_id text,
  action text not null check (action ~ '^[a-z_]+(\.[a-z_]+)+$'),
  entity text not null,
  entity_id text,
  source public.audit_source not null,
  diff jsonb not null default '{}'::jsonb
);
comment on table public.audit_events is 'Append-only audit log. actor_id = Clerk user ID, null for system events. No secrets or signature images.';
comment on column public.audit_events.diff is 'Sanitised before/after values of the change.';

create index audit_events_entity_idx on public.audit_events (entity, entity_id);
create index audit_events_created_at_idx on public.audit_events (created_at);
create index user_roles_role_idx on public.user_roles (role);

-- ---------------------------------------------------------------------------
-- 3. Helper functions (private schema, used by RLS policies)
-- ---------------------------------------------------------------------------

-- Clerk user ID of the caller, or null (anonymous / service role).
create function private.current_user_id()
returns text
language sql
stable
set search_path = ''
as $$
  select nullif(auth.jwt() ->> 'sub', '')
$$;

-- True when the caller is a known, active app user.
create function private.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.app_users u
    where u.clerk_user_id = private.current_user_id()
      and u.active
  )
$$;

-- True when the caller is active and holds at least one of the given roles.
create function private.has_any_role(roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles r
    join public.app_users u on u.clerk_user_id = r.clerk_user_id
    where r.clerk_user_id = private.current_user_id()
      and u.active
      and r.role = any (roles)
  )
$$;

revoke all on function private.current_user_id() from public;
revoke all on function private.is_active_user() from public;
revoke all on function private.has_any_role(public.app_role[]) from public;
grant execute on function private.current_user_id() to authenticated, service_role;
grant execute on function private.is_active_user() to authenticated, service_role;
grant execute on function private.has_any_role(public.app_role[]) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Server-set timestamps (never backdated, never edited)
-- ---------------------------------------------------------------------------
create function private.set_app_user_timestamps()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
  else
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger app_users_timestamps
before insert or update on public.app_users
for each row execute function private.set_app_user_timestamps();

create function private.set_granted_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.granted_at := now();
  return new;
end;
$$;

create trigger user_roles_granted_at
before insert on public.user_roles
for each row execute function private.set_granted_at();

-- Roles are granted or revoked, never edited in place.
create function private.forbid_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% on %.% is not allowed', tg_op, tg_table_schema, tg_table_name
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger user_roles_no_update
before update on public.user_roles
for each row execute function private.forbid_change();

-- ---------------------------------------------------------------------------
-- 5. Append-only audit log
-- ---------------------------------------------------------------------------
create function private.set_audit_created_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_at := now();
  return new;
end;
$$;

create trigger audit_events_created_at
before insert on public.audit_events
for each row execute function private.set_audit_created_at();

create trigger audit_events_no_update_delete
before update or delete on public.audit_events
for each row execute function private.forbid_change();

create trigger audit_events_no_truncate
before truncate on public.audit_events
for each statement execute function private.forbid_change();

-- ---------------------------------------------------------------------------
-- 6. Audit triggers for users and roles
-- ---------------------------------------------------------------------------
create function private.write_audit(
  p_action text,
  p_entity text,
  p_entity_id text,
  p_diff jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text := private.current_user_id();
begin
  insert into public.audit_events (actor_id, action, entity, entity_id, source, diff)
  values (
    v_actor,
    p_action,
    p_entity,
    p_entity_id,
    case when v_actor is null then 'system' else 'user' end::public.audit_source,
    coalesce(p_diff, '{}'::jsonb)
  );
end;
$$;
revoke all on function private.write_audit(text, text, text, jsonb) from public;

create function private.audit_app_users()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before jsonb;
  v_after jsonb;
begin
  v_after := jsonb_build_object(
    'email', new.email, 'first_name', new.first_name,
    'last_name', new.last_name, 'active', new.active);

  if tg_op = 'INSERT' then
    perform private.write_audit('user.created', 'app_user', new.clerk_user_id,
      jsonb_build_object('after', v_after));
    return null;
  end if;

  v_before := jsonb_build_object(
    'email', old.email, 'first_name', old.first_name,
    'last_name', old.last_name, 'active', old.active);

  if v_before = v_after then
    return null; -- nothing relevant changed (e.g. a repeated webhook)
  end if;

  perform private.write_audit(
    case
      when old.active and not new.active then 'user.deactivated'
      when not old.active and new.active then 'user.reactivated'
      else 'user.updated'
    end,
    'app_user', new.clerk_user_id,
    jsonb_build_object('before', v_before, 'after', v_after));
  return null;
end;
$$;

create trigger app_users_audit
after insert or update on public.app_users
for each row execute function private.audit_app_users();

create function private.audit_user_roles()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform private.write_audit('role.granted', 'app_user', new.clerk_user_id,
      jsonb_build_object('role', new.role, 'granted_by', new.granted_by));
  else
    perform private.write_audit('role.revoked', 'app_user', old.clerk_user_id,
      jsonb_build_object('role', old.role));
  end if;
  return null;
end;
$$;

create trigger user_roles_audit
after insert or delete on public.user_roles
for each row execute function private.audit_user_roles();

-- ---------------------------------------------------------------------------
-- 7. Row Level Security
-- ---------------------------------------------------------------------------
alter table public.app_users enable row level security;
alter table public.user_roles enable row level security;
alter table public.audit_events enable row level security;

-- app_users: active users read their own row; admins and auditors read all.
create policy "app_users: read own row or as admin/auditor"
on public.app_users for select to authenticated
using (
  (clerk_user_id = (select private.current_user_id()) and active)
  or (select private.has_any_role(array['admin', 'auditor']::public.app_role[]))
);

-- user_roles: active users read their own roles; admins and auditors read all.
create policy "user_roles: read own roles or as admin/auditor"
on public.user_roles for select to authenticated
using (
  (clerk_user_id = (select private.current_user_id()) and (select private.is_active_user()))
  or (select private.has_any_role(array['admin', 'auditor']::public.app_role[]))
);

-- audit_events: admins and auditors read; active users append events in their own name.
create policy "audit_events: read as admin/auditor"
on public.audit_events for select to authenticated
using ((select private.has_any_role(array['admin', 'auditor']::public.app_role[])));

create policy "audit_events: active users append own events"
on public.audit_events for insert to authenticated
with check (
  actor_id = (select private.current_user_id())
  and source in ('user', 'ai')
  and (select private.is_active_user())
);

-- No write policies on app_users / user_roles for `authenticated` yet: users are
-- synced by the Clerk webhook (service role); role management arrives with the
-- Admin → Users & roles feature.

-- ---------------------------------------------------------------------------
-- 8. Grants (the Data API sees only these)
-- ---------------------------------------------------------------------------
revoke all on public.app_users, public.user_roles, public.audit_events from anon, authenticated, service_role;

grant select on public.app_users to authenticated;
grant select on public.user_roles to authenticated;
grant select, insert on public.audit_events to authenticated;

-- service_role = server-only key used by the Clerk webhook and admin scripts.
-- It bypasses RLS but still cannot update/delete audit events (no grant + trigger).
grant select, insert, update on public.app_users to service_role;
grant select, insert, delete on public.user_roles to service_role;
grant select, insert on public.audit_events to service_role;

grant usage on type public.app_role to authenticated, service_role;
grant usage on type public.audit_source to authenticated, service_role;

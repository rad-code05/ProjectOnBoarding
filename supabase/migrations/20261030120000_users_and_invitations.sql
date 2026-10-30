-- F18a — Admin · Users & roles: invitations, role changes, deactivation.
--
--   user_invitations              who was invited (Clerk invitation id, name,
--                                 email, roles), by whom; pending until the
--                                 person signs up, or withdrawn / replaced.
--   admin_record_invitation()     checks an invitation (dry run without a
--                                 Clerk id) and records it once Clerk sent it.
--   admin_resend_invitation()     a new Clerk invitation replaces the old one.
--   admin_withdraw_invitation()   the link no longer gives any role.
--   sync_clerk_user()             the Clerk webhook / sync script: creates or
--                                 updates a person; a new person with a
--                                 pending invitation gets its roles; never
--                                 reactivates a deactivated person.
--   admin_set_user_roles()        an admin sets someone else's roles.
--   admin_deactivate_user()       no roles, no sign-in (Clerk ban by the app);
--   admin_reactivate_user()       history kept; back with chosen roles.
--   role_changes()                what approvers see under *Role changes*
--   mark_role_changes_seen()      (D5, decided 2026-10-30: role changes are
--                                 logged and shown to every approver).
--
-- Rules (Raju, 2026-10-30): nobody changes their own roles; at least one
-- active approver and one active admin always remain; nobody is deleted.

-- ---------------------------------------------------------------------------
-- 1. Invitations
-- ---------------------------------------------------------------------------
create table public.user_invitations (
  id uuid primary key default gen_random_uuid(),
  clerk_invitation_id text not null unique check (clerk_invitation_id ~ '^inv_\w+$'),
  email text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  first_name text not null,
  last_name text not null,
  roles public.app_role[] not null check (cardinality(roles) between 1 and 5),
  invited_by text not null references public.app_users (clerk_user_id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'withdrawn', 'replaced')),
  accepted_user_id text references public.app_users (clerk_user_id),
  closed_at timestamptz,
  closed_by text references public.app_users (clerk_user_id),
  check ((status = 'pending') = (closed_at is null)),
  check ((status = 'accepted') = (accepted_user_id is not null))
);
comment on table public.user_invitations is 'Invitations sent through Clerk (F18). Written only by the admin functions and sync_clerk_user().';

-- One open invitation per email.
create unique index user_invitations_one_pending_key
  on public.user_invitations (email) where status = 'pending';

alter table public.user_invitations enable row level security;

create policy "user_invitations: read as admin/auditor"
on public.user_invitations for select to authenticated
using ((select private.has_any_role(array['admin', 'auditor']::public.app_role[])));

revoke all on public.user_invitations from anon, authenticated, service_role;
grant select on public.user_invitations to authenticated;
grant select on public.user_invitations to service_role;

-- When an approver last opened *Role changes* (the "new" badge).
alter table public.app_users add column role_changes_seen_at timestamptz;

-- ---------------------------------------------------------------------------
-- 2. Helpers
-- ---------------------------------------------------------------------------

-- A work email: trimmed, lower case, one @ and a dot after it.
create function private.clean_email(p_email text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 200 then
    raise exception 'enter a valid work email' using errcode = 'check_violation';
  end if;
  return v_email;
end;
$$;

-- A person's first or last name: trimmed, inner spaces collapsed, 1–80.
create function private.clean_person_name(p_name text, p_label text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_name text := regexp_replace(btrim(coalesce(p_name, '')), '[[:space:]]+', ' ', 'g');
begin
  if v_name = '' or length(v_name) > 80 then
    raise exception 'enter the % (up to 80 characters)', p_label using errcode = 'check_violation';
  end if;
  return v_name;
end;
$$;

-- Roles without repeats, in a fixed order; at least one.
create function private.clean_roles(p_roles public.app_role[])
returns public.app_role[]
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_roles public.app_role[];
begin
  select coalesce(array_agg(r order by r), '{}')
  into v_roles
  from (select distinct unnest(p_roles) as r) s
  where r is not null;
  if cardinality(v_roles) = 0 then
    raise exception 'choose at least one role' using errcode = 'check_violation';
  end if;
  return v_roles;
end;
$$;

-- After roles were taken away: is there still an active approver and admin?
create function private.check_role_floor(p_removed public.app_role[])
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role public.app_role;
begin
  foreach v_role in array array['approver', 'admin']::public.app_role[] loop
    if v_role = any (p_removed) then
      if not exists (
        select 1
        from public.user_roles r
        join public.app_users u on u.clerk_user_id = r.clerk_user_id
        where r.role = v_role and u.active
      ) then
        raise exception 'at least one active % must remain', v_role
          using errcode = 'check_violation';
      end if;
    end if;
  end loop;
end;
$$;

-- An admin acting on someone else.
create function private.require_admin_on(p_user text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_admin text := private.require_admin();
begin
  if p_user = v_admin then
    raise exception 'nobody changes their own roles' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.app_users where clerk_user_id = p_user) then
    raise exception 'no such person' using errcode = 'no_data_found';
  end if;
  return v_admin;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Invitations: record, send again, withdraw
-- ---------------------------------------------------------------------------

-- Without a Clerk id: only checks (the app calls this before Clerk sends the
-- email, so a refused invitation never reaches anyone). With one: records it.
create function public.admin_record_invitation(
  p_email text,
  p_first_name text,
  p_last_name text,
  p_roles public.app_role[],
  p_clerk_invitation_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin text := private.require_admin();
  v_email text := private.clean_email(p_email);
  v_first text := private.clean_person_name(p_first_name, 'first name');
  v_last text := private.clean_person_name(p_last_name, 'last name');
  v_roles public.app_role[] := private.clean_roles(p_roles);
  v_id uuid;
begin
  if exists (select 1 from public.app_users where email = v_email and active) then
    raise exception '% already has an account', v_email using errcode = 'unique_violation';
  end if;
  if exists (select 1 from public.app_users where email = v_email and not active) then
    raise exception '% was deactivated — reactivate them instead', v_email
      using errcode = 'unique_violation';
  end if;
  if exists (select 1 from public.user_invitations
             where email = v_email and status = 'pending' and expires_at > now()) then
    raise exception '% is already invited — send it again instead', v_email
      using errcode = 'unique_violation';
  end if;

  if p_clerk_invitation_id is null then
    return null; -- checked only
  end if;

  -- An expired invitation for the same email is replaced by the new one.
  update public.user_invitations
  set status = 'replaced', closed_at = now(), closed_by = v_admin
  where email = v_email and status = 'pending';

  insert into public.user_invitations
    (clerk_invitation_id, email, first_name, last_name, roles, invited_by, expires_at)
  values
    (p_clerk_invitation_id, v_email, v_first, v_last, v_roles, v_admin, now() + interval '7 days')
  returning id into v_id;

  perform private.write_audit('user.invited', 'user_invitation', v_id::text,
    jsonb_build_object('email', v_email, 'first_name', v_first,
      'last_name', v_last, 'roles', to_jsonb(v_roles)));
  return v_id;
end;
$$;

-- Send again: Clerk's new invitation replaces the old one (same person, same
-- roles, 7 more days). Without a Clerk id: only checks.
create function public.admin_resend_invitation(
  p_id uuid,
  p_clerk_invitation_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin text := private.require_admin();
  v_old public.user_invitations;
  v_id uuid;
begin
  select * into v_old from public.user_invitations where id = p_id for update;
  if not found or v_old.status <> 'pending' then
    raise exception 'this invitation is no longer open' using errcode = 'check_violation';
  end if;
  if p_clerk_invitation_id is null then
    return null;
  end if;

  update public.user_invitations
  set status = 'replaced', closed_at = now(), closed_by = v_admin
  where id = p_id;

  insert into public.user_invitations
    (clerk_invitation_id, email, first_name, last_name, roles, invited_by, expires_at)
  values
    (p_clerk_invitation_id, v_old.email, v_old.first_name, v_old.last_name,
     v_old.roles, v_admin, now() + interval '7 days')
  returning id into v_id;

  perform private.write_audit('user.invitation_sent_again', 'user_invitation', v_id::text,
    jsonb_build_object('email', v_old.email, 'roles', to_jsonb(v_old.roles),
      'replaces', p_id));
  return v_id;
end;
$$;

create function public.admin_withdraw_invitation(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin text := private.require_admin();
  v_inv public.user_invitations;
begin
  select * into v_inv from public.user_invitations where id = p_id for update;
  if not found or v_inv.status <> 'pending' then
    raise exception 'this invitation is no longer open' using errcode = 'check_violation';
  end if;
  update public.user_invitations
  set status = 'withdrawn', closed_at = now(), closed_by = v_admin
  where id = p_id;
  perform private.write_audit('user.invitation_withdrawn', 'user_invitation', p_id::text,
    jsonb_build_object('email', v_inv.email, 'roles', to_jsonb(v_inv.roles)));
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Clerk → app_users (webhook and sync script, service role only)
-- ---------------------------------------------------------------------------
-- A new person with a pending invitation for their email gets its roles,
-- granted by the admin who invited them. An existing person keeps their
-- active flag (only an admin reactivates); banned in Clerk = deactivated.
create function public.sync_clerk_user(
  p_clerk_user_id text,
  p_email text,
  p_first_name text,
  p_last_name text,
  p_banned boolean default false
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(p_email));
  v_inv public.user_invitations;
  v_role public.app_role;
begin
  if exists (select 1 from public.app_users where clerk_user_id = p_clerk_user_id) then
    update public.app_users
    set email = v_email,
        first_name = p_first_name,
        last_name = p_last_name,
        active = active and not coalesce(p_banned, false)
    where clerk_user_id = p_clerk_user_id;
    return 'updated';
  end if;

  insert into public.app_users (clerk_user_id, email, first_name, last_name, active)
  values (p_clerk_user_id, v_email, p_first_name, p_last_name, not coalesce(p_banned, false));

  select * into v_inv
  from public.user_invitations
  where email = v_email and status = 'pending' and expires_at > now()
  for update;
  if not found then
    return 'created';
  end if;

  foreach v_role in array v_inv.roles loop
    insert into public.user_roles (clerk_user_id, role, granted_by)
    values (p_clerk_user_id, v_role, v_inv.invited_by)
    on conflict do nothing;
  end loop;
  update public.user_invitations
  set status = 'accepted', accepted_user_id = p_clerk_user_id, closed_at = now()
  where id = v_inv.id;
  perform private.write_audit('user.invitation_accepted', 'user_invitation', v_inv.id::text,
    jsonb_build_object('clerk_user_id', p_clerk_user_id, 'roles', to_jsonb(v_inv.roles)));
  return 'accepted';
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Roles, deactivate, reactivate (admin, never on themselves)
-- ---------------------------------------------------------------------------
create function public.admin_set_user_roles(p_user text, p_roles public.app_role[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin text := private.require_admin_on(p_user);
  v_roles public.app_role[] := private.clean_roles(p_roles);
  v_removed public.app_role[];
begin
  if not exists (select 1 from public.app_users where clerk_user_id = p_user and active) then
    raise exception 'reactivate this person first' using errcode = 'check_violation';
  end if;

  with gone as (
    delete from public.user_roles
    where clerk_user_id = p_user and not (role = any (v_roles))
    returning role
  )
  select coalesce(array_agg(role), '{}') into v_removed from gone;

  insert into public.user_roles (clerk_user_id, role, granted_by)
  select p_user, r, v_admin from unnest(v_roles) r
  on conflict do nothing;

  perform private.check_role_floor(v_removed);
end;
$$;

create function public.admin_deactivate_user(p_user text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_removed public.app_role[];
begin
  perform private.require_admin_on(p_user);
  if not exists (select 1 from public.app_users where clerk_user_id = p_user and active) then
    raise exception 'this person is already deactivated' using errcode = 'check_violation';
  end if;

  with gone as (
    delete from public.user_roles where clerk_user_id = p_user returning role
  )
  select coalesce(array_agg(role), '{}') into v_removed from gone;
  update public.app_users set active = false where clerk_user_id = p_user;

  perform private.check_role_floor(v_removed);
end;
$$;

create function public.admin_reactivate_user(p_user text, p_roles public.app_role[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin text := private.require_admin_on(p_user);
  v_roles public.app_role[] := private.clean_roles(p_roles);
  v_email text;
begin
  select email into v_email from public.app_users where clerk_user_id = p_user and not active;
  if not found then
    raise exception 'this person is already active' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.app_users where email = v_email and active) then
    raise exception '% has another active account', v_email using errcode = 'unique_violation';
  end if;

  update public.app_users set active = true where clerk_user_id = p_user;
  insert into public.user_roles (clerk_user_id, role, granted_by)
  select p_user, r, v_admin from unnest(v_roles) r;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Role changes for approvers (D5)
-- ---------------------------------------------------------------------------
-- Every role / invitation / (de)activation event, newest first, with names —
-- approvers can't read app_users, so this is security definer. Test users'
-- changes are hidden unless the reader is a test user.
create function public.role_changes(
  p_before timestamptz default null,
  p_limit integer default 20
)
returns table (
  id bigint,
  created_at timestamptz,
  action text,
  actor_name text,
  target_name text,
  roles text[],
  is_new boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user text := private.current_user_id();
  v_seen timestamptz;
  v_test boolean;
begin
  if v_user is null or not private.is_active_user()
     or not private.has_any_role(array['approver', 'admin', 'auditor']::public.app_role[]) then
    raise exception 'only approvers, admins and auditors see role changes'
      using errcode = 'insufficient_privilege';
  end if;
  select u.role_changes_seen_at, private.is_test_email(u.email)
  into v_seen, v_test
  from public.app_users u where u.clerk_user_id = v_user;

  return query
  select
    e.id,
    e.created_at,
    e.action,
    nullif(btrim(concat_ws(' ', actor.first_name, actor.last_name)), ''),
    coalesce(
      nullif(btrim(concat_ws(' ', target.first_name, target.last_name)), ''),
      nullif(btrim(concat_ws(' ', inv.first_name, inv.last_name)), ''),
      target.email, inv.email),
    case
      when e.action like 'role.%' then array[e.diff ->> 'role']
      when e.diff ? 'roles' then array(select jsonb_array_elements_text(e.diff -> 'roles'))
      else '{}'::text[]
    end,
    e.created_at > coalesce(v_seen, '-infinity'::timestamptz)
      and e.actor_id is distinct from v_user
  from public.audit_events e
  left join public.app_users actor on actor.clerk_user_id = e.actor_id
  left join public.app_users target
    on e.entity = 'app_user' and target.clerk_user_id = e.entity_id
  left join public.user_invitations inv
    on e.entity = 'user_invitation' and inv.id::text = e.entity_id
  where e.action in ('role.granted', 'role.revoked', 'user.invited',
                     'user.invitation_sent_again', 'user.invitation_withdrawn',
                     'user.invitation_accepted', 'user.deactivated', 'user.reactivated')
    and (p_before is null or e.created_at < p_before)
    and (v_test
         or not (private.is_test_email(coalesce(target.email, inv.email))
                 or coalesce(private.is_test_email(actor.email), false)))
  order by e.created_at desc, e.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
end;
$$;

create function public.mark_role_changes_seen()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.app_users
  set role_changes_seen_at = now()
  where clerk_user_id = private.current_user_id() and active;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Grants
-- ---------------------------------------------------------------------------
revoke all on function private.clean_email(text) from public;
revoke all on function private.clean_person_name(text, text) from public;
revoke all on function private.clean_roles(public.app_role[]) from public;
revoke all on function private.check_role_floor(public.app_role[]) from public;
revoke all on function private.require_admin_on(text) from public;

revoke all on function public.admin_record_invitation(text, text, text, public.app_role[], text) from public, anon;
revoke all on function public.admin_resend_invitation(uuid, text) from public, anon;
revoke all on function public.admin_withdraw_invitation(uuid) from public, anon;
revoke all on function public.sync_clerk_user(text, text, text, text, boolean) from public, anon, authenticated;
revoke all on function public.admin_set_user_roles(text, public.app_role[]) from public, anon;
revoke all on function public.admin_deactivate_user(text) from public, anon;
revoke all on function public.admin_reactivate_user(text, public.app_role[]) from public, anon;
revoke all on function public.role_changes(timestamptz, integer) from public, anon;
revoke all on function public.mark_role_changes_seen() from public, anon;

grant execute on function public.admin_record_invitation(text, text, text, public.app_role[], text) to authenticated;
grant execute on function public.admin_resend_invitation(uuid, text) to authenticated;
grant execute on function public.admin_withdraw_invitation(uuid) to authenticated;
grant execute on function public.sync_clerk_user(text, text, text, text, boolean) to service_role;
grant execute on function public.admin_set_user_roles(text, public.app_role[]) to authenticated;
grant execute on function public.admin_deactivate_user(text) to authenticated;
grant execute on function public.admin_reactivate_user(text, public.app_role[]) to authenticated;
grant execute on function public.role_changes(timestamptz, integer) to authenticated;
grant execute on function public.mark_role_changes_seen() to authenticated;

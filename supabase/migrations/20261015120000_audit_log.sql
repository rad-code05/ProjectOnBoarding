-- F11a — Audit log page and request activity (database part).
--
--   * audit_log(…): one page of the audit log for admins and auditors —
--     filters (search, source, person, group, dates, hide the test users),
--     newest first, keyset paging, the total for "48 events", and the names /
--     record each row needs. Runs as the caller: RLS already limits
--     audit_events, app_users and user_roles to admins and auditors.
--   * export_audit_log(…): every event the same filters match (max 10 000),
--     and the export itself is written to the audit log ("audit.exported").
--   * request_activity(request): everything that happened to one request —
--     for whoever may see it, but approvers only on records (closed), never
--     drafts or work in progress (decided 2026-10-15). Notes for the approver
--     and return comments are included.
--   * The automatic browser-test users (e2e.*+clerk_test@…) are flagged so the
--     page can hide them (on by default); their entries are kept.
--   * Group of an event (Requests · Signatures & approvals · Records & PDFs ·
--     Admin & catalog · Sign-in & accounts) is decided in one place.

-- ---------------------------------------------------------------------------
-- 1. Helpers
-- ---------------------------------------------------------------------------

-- The browser-test accounts in the Clerk dev instance.
create function private.is_test_email(p_email text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_email ~ '^e2e\.[^@]*\+clerk_test@', false)
$$;

-- Which filter group an action belongs to.
create function private.audit_group(p_action text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_action in ('request.signed', 'request.confirmed', 'request.returned')
      or p_action like 'signature.%' then 'signatures'
    when p_action like 'record.%' or p_action like 'audit.%' then 'records'
    when p_action like 'request.%' or p_action like 'employee.%'
      or p_action like 'inventory.%' then 'requests'
    when p_action like 'session.%' or p_action like 'account.%' then 'accounts'
    else 'admin' -- catalog.*, settings.*, user.*, role.*, dev.*
  end
$$;
comment on function private.audit_group(text) is 'Filter group of an audit action: requests, signatures, records, admin, accounts.';

create function private.require_audit_reader()
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
     or not private.has_any_role(array['admin', 'auditor']::public.app_role[]) then
    raise exception 'only admins and auditors read the audit log' using errcode = 'insufficient_privilege';
  end if;
  return v_user;
end;
$$;

grant execute on function private.is_test_email(text) to authenticated;
grant execute on function private.audit_group(text) to authenticated;
revoke all on function private.require_audit_reader() from public;
grant execute on function private.require_audit_reader() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Indexes: newest-first paging, "Who", and inventory events of a request
-- ---------------------------------------------------------------------------
drop index public.audit_events_created_at_idx;
create index audit_events_created_at_id_idx on public.audit_events (created_at, id);
create index audit_events_actor_idx on public.audit_events (actor_id, created_at);
create index audit_events_inventory_request_idx on public.audit_events ((diff ->> 'request_id'))
  where entity = 'employee';

-- ---------------------------------------------------------------------------
-- 3. The audit log (filtered rows, shared by the page and the export)
-- ---------------------------------------------------------------------------
-- p_actor: a Clerk user ID, or 'system' for events without a person.
-- p_from / p_to: from (inclusive) … to (exclusive); the app turns days in the
-- company timezone into instants.
create function private.audit_rows(
  p_search text,
  p_sources public.audit_source[],
  p_actor text,
  p_groups text[],
  p_from timestamptz,
  p_to timestamptz,
  p_hide_test boolean
)
returns table (
  id bigint,
  created_at timestamptz,
  action text,
  group_key text,
  source public.audit_source,
  actor_id text,
  actor_name text,
  actor_email text,
  actor_roles public.app_role[],
  is_test_user boolean,
  entity text,
  entity_id text,
  request_id uuid,
  ticket_id text,
  request_type public.request_type,
  employee_name text,
  diff jsonb
)
language sql
stable
set search_path = ''
as $$
  with base as (
    select
      e.*,
      u.email as u_email,
      nullif(trim(concat_ws(' ', u.first_name, u.last_name)), '') as u_name,
      case
        when e.entity = 'request' then e.entity_id
        when e.entity = 'employee' then e.diff ->> 'request_id'
      end as req_text,
      private.is_test_email(u.email)
        or (e.actor_id is null and e.entity = 'app_user' and private.is_test_email(t.email)) as test_user
    from public.audit_events e
    left join public.app_users u on u.clerk_user_id = e.actor_id
    left join public.app_users t on e.entity = 'app_user' and t.clerk_user_id = e.entity_id
    where (p_from is null or e.created_at >= p_from)
      and (p_to is null or e.created_at < p_to)
      and (p_sources is null or cardinality(p_sources) = 0 or e.source = any (p_sources))
      and (p_actor is null
           or (p_actor = 'system' and e.actor_id is null)
           or e.actor_id = p_actor)
      and (p_groups is null or cardinality(p_groups) = 0 or private.audit_group(e.action) = any (p_groups))
  )
  select
    b.id, b.created_at, b.action, private.audit_group(b.action), b.source,
    b.actor_id, b.u_name, b.u_email,
    coalesce((select array_agg(r.role order by r.role) from public.user_roles r
              where r.clerk_user_id = b.actor_id), '{}'),
    coalesce(b.test_user, false),
    b.entity, b.entity_id,
    q.id, q.ticket_id, q.type,
    nullif(trim(concat_ws(' ', q.first_name, q.last_name)), ''),
    b.diff
  from base b
  left join public.requests q
    on b.req_text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   and q.id = b.req_text::uuid
  where not (coalesce(p_hide_test, true) and coalesce(b.test_user, false))
    and (nullif(trim(p_search), '') is null
         or concat_ws(' ', b.u_name, b.u_email, b.action, b.entity_id, q.ticket_id,
                      q.first_name, q.last_name, b.diff::text)
            ilike '%' || trim(p_search) || '%')
$$;
revoke all on function private.audit_rows(text, public.audit_source[], text, text[], timestamptz, timestamptz, boolean) from public;
grant execute on function private.audit_rows(text, public.audit_source[], text, text[], timestamptz, timestamptz, boolean) to authenticated;

-- One page, newest first. Next page: pass the last row's created_at and id.
create function public.audit_log(
  p_search text default null,
  p_sources public.audit_source[] default null,
  p_actor text default null,
  p_groups text[] default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_hide_test boolean default true,
  p_before_at timestamptz default null,
  p_before_id bigint default null,
  p_limit integer default 30
)
returns table (
  id bigint,
  created_at timestamptz,
  action text,
  group_key text,
  source public.audit_source,
  actor_id text,
  actor_name text,
  actor_email text,
  actor_roles public.app_role[],
  is_test_user boolean,
  entity text,
  entity_id text,
  request_id uuid,
  ticket_id text,
  request_type public.request_type,
  employee_name text,
  diff jsonb,
  total_count bigint
)
language plpgsql
stable
set search_path = ''
as $$
begin
  perform private.require_audit_reader();
  return query
  with f as (
    select * from private.audit_rows(p_search, p_sources, p_actor, p_groups, p_from, p_to, p_hide_test)
  )
  select f.*, (select count(*) from f)
  from f
  where p_before_at is null
     or (f.created_at, f.id) < (p_before_at, coalesce(p_before_id, 9223372036854775807))
  order by f.created_at desc, f.id desc
  limit least(greatest(coalesce(p_limit, 30), 1), 200);
end;
$$;
comment on function public.audit_log(text, public.audit_source[], text, text[], timestamptz, timestamptz, boolean, timestamptz, bigint, integer)
  is 'One page of the audit log (admins and auditors), newest first, with the filtered total.';

-- Every event the filters match (max 10 000, newest first); the export is
-- itself recorded with its filters and row count.
create function public.export_audit_log(
  p_search text default null,
  p_sources public.audit_source[] default null,
  p_actor text default null,
  p_groups text[] default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_hide_test boolean default true
)
returns table (
  id bigint,
  created_at timestamptz,
  action text,
  group_key text,
  source public.audit_source,
  actor_id text,
  actor_name text,
  actor_email text,
  actor_roles public.app_role[],
  is_test_user boolean,
  entity text,
  entity_id text,
  request_id uuid,
  ticket_id text,
  request_type public.request_type,
  employee_name text,
  diff jsonb
)
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_user text := private.require_audit_reader();
  v_total bigint;
  v_rows integer;
  v_event bigint;
begin
  select count(*) into v_total
  from private.audit_rows(p_search, p_sources, p_actor, p_groups, p_from, p_to, p_hide_test);
  v_rows := least(v_total, 10000);

  insert into public.audit_events (actor_id, action, entity, entity_id, source, diff)
  values (v_user, 'audit.exported', 'audit_log', null, 'user', jsonb_build_object(
    'filters', jsonb_strip_nulls(jsonb_build_object(
      'search', nullif(trim(p_search), ''), 'sources', p_sources, 'actor', p_actor,
      'groups', p_groups, 'from', p_from, 'to', p_to,
      'hide_test_users', coalesce(p_hide_test, true))),
    'rows', v_rows,
    'truncated', v_total > 10000))
  returning audit_events.id into v_event;

  -- The export's own event is not part of what was exported.
  return query
  select * from private.audit_rows(p_search, p_sources, p_actor, p_groups, p_from, p_to, p_hide_test) x
  where x.id <> v_event
  order by x.created_at desc, x.id desc
  limit 10000;
end;
$$;
comment on function public.export_audit_log(text, public.audit_source[], text, text[], timestamptz, timestamptz, boolean)
  is 'CSV export of the audit log (admins and auditors); the export is itself audited (audit.exported).';

-- ---------------------------------------------------------------------------
-- 4. Request activity (timeline on the request and record pages)
-- ---------------------------------------------------------------------------
create function public.request_activity(p_request_id uuid)
returns table (
  id bigint,
  created_at timestamptz,
  action text,
  source public.audit_source,
  actor_id text,
  actor_name text,
  diff jsonb,
  note text,
  flagged_sections smallint[]
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_state public.request_state;
begin
  select r.state into v_state from public.requests r where r.id = p_request_id;
  if private.current_user_id() is null or not private.is_active_user() or v_state is null
     or not (
       private.has_any_role(array['admin', 'requester', 'it_operator', 'auditor']::public.app_role[])
       or (private.has_any_role(array['approver']::public.app_role[]) and v_state = 'closed')
     ) then
    raise exception 'you cannot see the activity of this request' using errcode = 'insufficient_privilege';
  end if;

  return query
  select
    e.id, e.created_at, e.action, e.source, e.actor_id,
    nullif(trim(concat_ws(' ', u.first_name, u.last_name)), ''),
    e.diff,
    coalesce(nullif(e.diff ->> 'note', ''), a.comment),
    coalesce(a.flagged_sections, '{}')
  from public.audit_events e
  left join public.app_users u on u.clerk_user_id = e.actor_id
  left join public.approvals a
    on e.action = 'request.returned'
   and a.id::text = e.diff ->> 'approval_id'
  where (e.entity = 'request' and e.entity_id = p_request_id::text)
     or (e.entity = 'employee' and e.diff ->> 'request_id' = p_request_id::text)
  order by e.created_at desc, e.id desc;
end;
$$;
comment on function public.request_activity(uuid)
  is 'Everything that happened to one request, newest first. Approvers: closed requests (records) only.';

-- ---------------------------------------------------------------------------
-- 5. Grants
-- ---------------------------------------------------------------------------
revoke all on function public.audit_log(text, public.audit_source[], text, text[], timestamptz, timestamptz, boolean, timestamptz, bigint, integer) from public, anon;
revoke all on function public.export_audit_log(text, public.audit_source[], text, text[], timestamptz, timestamptz, boolean) from public, anon;
revoke all on function public.request_activity(uuid) from public, anon;
grant execute on function public.audit_log(text, public.audit_source[], text, text[], timestamptz, timestamptz, boolean, timestamptz, bigint, integer) to authenticated;
grant execute on function public.export_audit_log(text, public.audit_source[], text, text[], timestamptz, timestamptz, boolean) to authenticated;
grant execute on function public.request_activity(uuid) to authenticated;

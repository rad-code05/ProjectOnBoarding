-- F06a: Review & sign (Raju) — snapshots, signatures and the signing step.
--
-- Raju signs section 9 once the IT work is done. Signing:
--   * checks his role, the request's state, section 9, the required fields
--     and that he has an active signature (My profile, F05);
--   * freezes a snapshot of the request (request_snapshots) and its SHA-256,
--     computed here from the RFC 8785 canonical form of the snapshot;
--   * refuses if the request changed since he reviewed it (the reviewed
--     snapshot must equal the one rebuilt now — item rows don't bump the
--     request version, so a version number alone would not prove it);
--   * records the signature with server time (signatures) and moves the
--     request to pending_confirmation, which locks sections 1–9 (existing
--     RLS: nothing is editable outside draft / in_execution / returned).
-- transition_request() no longer sends a request for confirmation on its
-- own: that only happens inside sign_request().
-- Signature = internal acknowledgment (D13). The AI never signs (no tool).

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------
create table public.request_snapshots (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests (id),
  kind text not null check (kind in ('it_signature', 'approval', 'closure')),
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  created_by text not null references public.app_users (clerk_user_id),
  created_at timestamptz not null default now()
);
comment on table public.request_snapshots is 'Frozen copies of a request at signing / closing. sha256 = SHA-256 of private.canonical_json(data) (RFC 8785). Never edited or deleted.';

create table public.signatures (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests (id),
  section text not null check (section in ('it_execution', 'final_confirmation')),
  signer_id text not null references public.app_users (clerk_user_id),
  signer_role public.app_role not null,
  signature_asset_id uuid not null references public.signature_assets (id),
  form_version_id smallint not null references public.form_versions (id),
  snapshot_id uuid not null references public.request_snapshots (id),
  signed_at timestamptz not null default now(),
  cleared_at timestamptz,
  cleared_reason text check (length(cleared_reason) <= 1000)
);
comment on table public.signatures is 'Section 11 signatures. signed_at is server time. A returned request clears the IT signature (cleared_at); rows are never deleted.';

create index request_snapshots_request_idx on public.request_snapshots (request_id);
create index signatures_request_idx on public.signatures (request_id);
-- One current signature per section.
create unique index signatures_one_current_idx on public.signatures (request_id, section)
where cleared_at is null;

-- Server time only — never backdated.
create function private.set_signed_times()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_name = 'signatures' then
    new.signed_at := now();
    new.cleared_at := null;
    new.cleared_reason := null;
  else
    new.created_at := now();
  end if;
  return new;
end;
$$;

create trigger request_snapshots_times before insert on public.request_snapshots
for each row execute function private.set_signed_times();
create trigger signatures_times before insert on public.signatures
for each row execute function private.set_signed_times();

create trigger request_snapshots_no_change before update or delete on public.request_snapshots
for each row execute function private.forbid_change();
create trigger signatures_no_delete before delete on public.signatures
for each row execute function private.forbid_change();

-- A signature can only be cleared (once), and only by the workflow.
create function private.signatures_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(current_setting('app.signature_clear', true), 'off') <> 'on'
     or old.cleared_at is not null
     or new.cleared_at is null
     or (to_jsonb(new) - 'cleared_at' - 'cleared_reason') <> (to_jsonb(old) - 'cleared_at' - 'cleared_reason') then
    raise exception 'signatures are never edited' using errcode = 'insufficient_privilege';
  end if;
  new.cleared_at := now();
  return new;
end;
$$;

create trigger signatures_only_clear before update on public.signatures
for each row execute function private.signatures_before_update();

-- ---------------------------------------------------------------------------
-- 2. Snapshot, canonical form, checks
-- ---------------------------------------------------------------------------

-- RFC 8785 (JSON Canonicalization Scheme) for what snapshots hold: objects,
-- arrays, strings, booleans, null and whole numbers. Keys sorted by code
-- point (same as RFC 8785's UTF-16 order for our ASCII keys), no spaces,
-- strings escaped like ECMAScript JSON.stringify (Postgres does the same).
create function private.canonical_json(p_value jsonb)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_out text;
begin
  case jsonb_typeof(p_value)
    when 'object' then
      select '{' || coalesce(string_agg(to_json(k)::text || ':' || private.canonical_json(p_value -> k), ',' order by k collate "C"), '') || '}'
      into v_out
      from jsonb_object_keys(p_value) as k;
      return v_out;
    when 'array' then
      select '[' || coalesce(string_agg(private.canonical_json(e), ',' order by o), '') || ']'
      into v_out
      from jsonb_array_elements(p_value) with ordinality as t (e, o);
      return v_out;
    when 'string' then
      return to_json(p_value #>> '{}')::text;
    when 'number' then
      if p_value::text ~ '^-?(0|[1-9][0-9]{0,14})$' then
        return p_value::text;
      end if;
      raise exception 'snapshots hold whole numbers only' using errcode = 'check_violation';
    when 'boolean' then
      return p_value::text;
    else
      return 'null';
  end case;
end;
$$;

create function private.snapshot_sha256(p_data jsonb)
returns text
language sql
stable
set search_path = ''
as $$
  select encode(pg_catalog.sha256(convert_to(private.canonical_json(p_data), 'UTF8')), 'hex');
$$;

create function private.utc_text(p_at timestamptz)
returns text
language sql
immutable
set search_path = ''
as $$
  select to_char(p_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
$$;

create function private.user_name(p_user_id text)
returns text
language sql
stable
set search_path = ''
as $$
  select nullif(trim(concat_ws(' ', u.first_name, u.last_name)), '')
  from public.app_users u where u.clerk_user_id = p_user_id;
$$;

-- Everything that is signed, built in ONE place. Only text, booleans and
-- null (dates and times as UTC text), so the canonical form is exact.
create function private.request_snapshot_data(p_request_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'request', jsonb_build_object(
      'id', r.id::text,
      'ticket_id', r.ticket_id,
      'type', r.type::text,
      'priority', r.priority::text,
      'form_version', fv.version,
      'first_name', r.first_name,
      'last_name', r.last_name,
      'work_email', r.work_email,
      'job_title', r.job_title,
      'department', d.name,
      'country', r.country,
      'manager_name', r.manager_name,
      'requestor_name', r.requestor_name,
      'effective_date', r.effective_date::text,
      'custom_fields', r.custom_fields,
      'assignee_id', r.assignee_id,
      'assignee_name', private.user_name(r.assignee_id),
      'created_by', r.created_by,
      'created_by_name', private.user_name(r.created_by),
      'created_at', private.utc_text(r.created_at),
      'execution_started_at', private.utc_text(r.execution_started_at)
    ),
    'access', coalesce((
      select jsonb_agg(jsonb_build_object(
        'category', a.category_name, 'app', a.app_name, 'action', a.action,
        'permission', a.permission, 'notes', a.notes) order by a.created_at, a.id)
      from public.request_access_items a where a.request_id = r.id), '[]'::jsonb),
    'equipment', coalesce((
      select jsonb_agg(jsonb_build_object(
        'type', e.type_name, 'action', e.action, 'description', e.description,
        'asset_tag', e.asset_tag, 'notes', e.notes) order by e.created_at, e.id)
      from public.request_equipment_items e where e.request_id = r.id), '[]'::jsonb),
    'physical_access', coalesce((
      select jsonb_agg(jsonb_build_object(
        'type', p.type_name, 'action', p.action, 'scope', p.scope, 'notes', p.notes)
        order by p.created_at, p.id)
      from public.request_physical_access_items p where p.request_id = r.id), '[]'::jsonb),
    'execution', (
      select jsonb_build_object(
        'checks', c.checks, 'notes', c.notes,
        'executed_by', c.executed_by, 'executed_by_name', private.user_name(c.executed_by))
      from public.execution_confirmations c where c.request_id = r.id)
  )
  from public.requests r
  join public.form_versions fv on fv.id = r.form_version_id
  left join public.departments d on d.id = r.department_id
  where r.id = p_request_id;
$$;

-- Labels of required form fields (of the request's form version and type)
-- that are still empty.
create function private.missing_required_fields(p_request_id uuid)
returns text[]
language sql
stable
set search_path = ''
as $$
  select coalesce(array_agg(f.label order by f.section, f.sort_order), '{}')
  from public.requests r
  join public.form_fields f on f.form_version_id = r.form_version_id
  where r.id = p_request_id
    and f.required
    and f.field_type <> 'system'
    and r.type = any (f.applies_to)
    and nullif(trim(case
          when f.storage = 'custom' then r.custom_fields ->> f.key
          else to_jsonb(r) ->> case f.key
            when 'department' then 'department_id'
            when 'assignee' then 'assignee_id'
            else f.key end
        end), '') is null;
$$;

create function private.require_signer()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user text := private.current_user_id();
begin
  if v_user is null or not private.is_active_user() then
    raise exception 'sign in first' using errcode = 'insufficient_privilege';
  end if;
  if not private.has_any_role(array['admin', 'it_operator']::public.app_role[]) then
    raise exception 'only an IT operator signs section 9' using errcode = 'insufficient_privilege';
  end if;
  return v_user;
end;
$$;

-- What the Review & sign sheet shows: exactly the data that will be signed.
create function public.request_snapshot_preview(p_request_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_signer();
  return private.request_snapshot_data(p_request_id);
end;
$$;
comment on function public.request_snapshot_preview(uuid) is 'The snapshot Review & sign shows; pass it back unchanged to sign_request().';

-- The blocking checks of Review & sign, by the same rules sign_request() uses.
create function public.signing_checks(p_request_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user text := private.require_signer();
  v_state public.request_state;
  v_asset public.signature_assets;
begin
  select state into v_state from public.requests where id = p_request_id;
  if not found then
    raise exception 'request not found' using errcode = 'no_data_found';
  end if;
  select * into v_asset from public.signature_assets where user_id = v_user and is_active;
  return jsonb_build_object(
    'state_ok', v_state in ('in_execution', 'returned'),
    'missing_fields', to_jsonb(private.missing_required_fields(p_request_id)),
    'checklist_complete', private.execution_complete(p_request_id),
    'signature', case when v_asset.id is null then null else jsonb_build_object(
      'id', v_asset.id, 'kind', v_asset.kind, 'source', v_asset.source,
      'created_at', private.utc_text(v_asset.created_at)) end
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Signing
-- ---------------------------------------------------------------------------
create function public.sign_request(p_request_id uuid, p_reviewed jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user text := private.require_signer();
  v_request public.requests;
  v_missing text[];
  v_asset uuid;
  v_data jsonb;
  v_hash text;
  v_snapshot uuid;
  v_signature uuid;
begin
  select * into v_request from public.requests where id = p_request_id for update;
  if not found then
    raise exception 'request not found' using errcode = 'no_data_found';
  end if;
  if v_request.state not in ('in_execution', 'returned') then
    raise exception 'only a request in execution can be signed' using errcode = 'check_violation';
  end if;
  if not private.execution_complete(p_request_id) then
    raise exception 'section 9 checklist is not complete' using errcode = 'check_violation';
  end if;
  v_missing := private.missing_required_fields(p_request_id);
  if cardinality(v_missing) > 0 then
    raise exception 'required fields are empty: %', array_to_string(v_missing, ', ')
      using errcode = 'check_violation';
  end if;
  select id into v_asset from public.signature_assets where user_id = v_user and is_active;
  if v_asset is null then
    raise exception 'add your signature or initials in My profile first' using errcode = 'check_violation';
  end if;

  v_data := private.request_snapshot_data(p_request_id);
  if p_reviewed is distinct from v_data then
    raise exception 'the request changed while you were reviewing it — review it again'
      using errcode = 'serialization_failure';
  end if;
  v_hash := private.snapshot_sha256(v_data);

  insert into public.request_snapshots (request_id, kind, data, sha256, created_by)
  values (p_request_id, 'it_signature', v_data, v_hash, v_user)
  returning id into v_snapshot;

  -- Signing again after a return replaces the earlier IT signature.
  perform set_config('app.signature_clear', 'on', true);
  update public.signatures
  set cleared_at = now(), cleared_reason = 'Signed again after the request was returned'
  where request_id = p_request_id and section = 'it_execution' and cleared_at is null;
  perform set_config('app.signature_clear', 'off', true);

  insert into public.signatures
    (request_id, section, signer_id, signer_role, signature_asset_id, form_version_id, snapshot_id)
  values (
    p_request_id, 'it_execution', v_user,
    case when private.has_any_role(array['it_operator']::public.app_role[])
      then 'it_operator' else 'admin' end::public.app_role,
    v_asset, v_request.form_version_id, v_snapshot)
  returning id into v_signature;

  perform set_config('app.request_signing', 'on', true);
  perform public.transition_request(p_request_id, 'pending_confirmation');
  perform set_config('app.request_signing', 'off', true);

  perform private.write_audit('request.signed', 'request', p_request_id::text,
    jsonb_build_object('ticket_id', v_request.ticket_id, 'section', 'it_execution',
      'signature_id', v_signature, 'snapshot_id', v_snapshot, 'snapshot_sha256', v_hash));
  return v_signature;
end;
$$;
comment on function public.sign_request(uuid, jsonb) is 'Raju''s Review & sign: checks, frozen snapshot + SHA-256, signature with server time, → pending_confirmation, audit.';

-- ---------------------------------------------------------------------------
-- 4. The state machine: confirmation only through signing
-- ---------------------------------------------------------------------------
create or replace function public.transition_request(
  p_request_id uuid,
  p_to public.request_state,
  p_reason text default null
)
returns public.request_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user text := private.current_user_id();
  v_request public.requests;
  v_reason text := nullif(trim(p_reason), '');
  v_it_side boolean := private.has_any_role(array['admin', 'requester', 'it_operator']::public.app_role[]);
  v_executor boolean := private.has_any_role(array['admin', 'it_operator']::public.app_role[]);
  v_cancels boolean := private.has_any_role(array['admin', 'requester']::public.app_role[]);
  v_approver boolean := private.has_any_role(array['approver']::public.app_role[]);
  v_executed_by text;
begin
  if v_user is null or not private.is_active_user() then
    raise exception 'sign in first' using errcode = 'insufficient_privilege';
  end if;

  select * into v_request from public.requests where id = p_request_id for update;
  if not found then
    raise exception 'request not found' using errcode = 'no_data_found';
  end if;

  case
    when v_request.state = 'draft' and p_to = 'in_execution' then
      if not v_it_side then
        raise exception 'only the IT side starts execution' using errcode = 'insufficient_privilege';
      end if;

    when v_request.state in ('in_execution', 'returned') and p_to = 'pending_confirmation' then
      if coalesce(current_setting('app.request_signing', true), 'off') <> 'on' then
        raise exception 'send it for confirmation with Review & sign' using errcode = 'insufficient_privilege';
      end if;
      if not v_executor then
        raise exception 'only an IT operator sends a request for confirmation' using errcode = 'insufficient_privilege';
      end if;
      if not private.execution_complete(p_request_id) then
        raise exception 'section 9 checklist is not complete' using errcode = 'check_violation';
      end if;

    when v_request.state = 'pending_confirmation' and p_to in ('closed', 'returned') then
      if not v_approver then
        raise exception 'only an approver confirms or returns a request' using errcode = 'insufficient_privilege';
      end if;
      select c.executed_by into v_executed_by from public.execution_confirmations c where c.request_id = p_request_id;
      if p_to = 'closed' and v_user in (v_request.created_by, v_executed_by) then
        raise exception 'nobody confirms their own request' using errcode = 'insufficient_privilege';
      end if;
      if p_to = 'returned' and v_reason is null then
        raise exception 'say what needs fixing' using errcode = 'check_violation';
      end if;

    when v_request.state in ('draft', 'in_execution', 'pending_confirmation', 'returned') and p_to = 'cancelled' then
      if not v_cancels then
        raise exception 'only Raju cancels a request' using errcode = 'insufficient_privilege';
      end if;
      if v_reason is null then
        raise exception 'a reason is required to cancel' using errcode = 'check_violation';
      end if;

    else
      raise exception 'a request cannot go from % to %', v_request.state, p_to using errcode = 'check_violation';
  end case;

  perform set_config('app.request_transition', 'on', true);
  update public.requests set
    state = p_to,
    state_changed_at = now(),
    execution_started_at = case when p_to = 'in_execution' then now() else execution_started_at end,
    closed_at = case when p_to = 'closed' then now() else closed_at end,
    cancelled_at = case when p_to = 'cancelled' then now() else cancelled_at end,
    cancelled_by = case when p_to = 'cancelled' then v_user else cancelled_by end,
    cancel_reason = case when p_to = 'cancelled' then v_reason else cancel_reason end,
    return_reason = case when p_to = 'returned' then v_reason else return_reason end
  where id = p_request_id;
  perform set_config('app.request_transition', 'off', true);

  perform private.write_audit('request.state_changed', 'request', p_request_id::text,
    jsonb_build_object('ticket_id', v_request.ticket_id, 'from', v_request.state, 'to', p_to, 'reason', v_reason));
  return p_to;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Row Level Security and grants
-- ---------------------------------------------------------------------------
alter table public.request_snapshots enable row level security;
alter table public.signatures enable row level security;

-- Visible to whoever may see the request (requests RLS decides). Written only
-- by sign_request() (security definer) — no insert/update for anyone.
create policy "request_snapshots: visible with their request" on public.request_snapshots
for select to authenticated
using (exists (select 1 from public.requests r where r.id = request_id));
create policy "signatures: visible with their request" on public.signatures
for select to authenticated
using (exists (select 1 from public.requests r where r.id = request_id));

revoke all on public.request_snapshots, public.signatures from anon, authenticated, service_role;
grant select on public.request_snapshots, public.signatures to authenticated, service_role;

revoke all on function private.set_signed_times() from public;
revoke all on function private.signatures_before_update() from public;
revoke all on function private.canonical_json(jsonb) from public;
revoke all on function private.snapshot_sha256(jsonb) from public;
revoke all on function private.utc_text(timestamptz) from public;
revoke all on function private.user_name(text) from public;
revoke all on function private.request_snapshot_data(uuid) from public;
revoke all on function private.missing_required_fields(uuid) from public;
revoke all on function private.require_signer() from public;

revoke all on function public.request_snapshot_preview(uuid) from public, anon;
revoke all on function public.signing_checks(uuid) from public, anon;
revoke all on function public.sign_request(uuid, jsonb) from public, anon;
grant execute on function public.request_snapshot_preview(uuid) to authenticated;
grant execute on function public.signing_checks(uuid) to authenticated;
grant execute on function public.sign_request(uuid, jsonb) to authenticated;

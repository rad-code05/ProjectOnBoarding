-- F16a Filling requests by chat (database).
--
--   request_suggestions          what the assistant proposes for a request:
--                                one row per field (section 1–2), application
--                                (5), equipment (6) or access type (7). Nothing
--                                on the request changes until the person
--                                accepts. One waiting suggestion per target —
--                                a newer one replaces it.
--   suggest_request_values()     the assistant's only way to write them
--                                (admin / requester, open requests, catalog
--                                targets only); audited once per call.
--   accept_request_suggestion()  saves the value exactly like typing: the same
--                                table writes under the person's own access
--                                (RLS, checks, triggers, version + 1) — the
--                                audit lines say source = ai.
--   reject_request_suggestion()  leaves the request as it was.
--   ai_start_request()           creates the draft after the person's Confirm
--                                (onboarding, offboarding or access change),
--                                audited source = ai.
--   private.write_audit()        writes source = ai while app.audit_source is
--                                'ai' (set for one transaction by the
--                                functions above, never by people).

-- ---------------------------------------------------------------------------
-- 1. Audit source: 'ai' for changes the assistant made or proposed
-- ---------------------------------------------------------------------------
create or replace function private.write_audit(
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
    case
      when v_actor is null then 'system'
      when current_setting('app.audit_source', true) = 'ai' then 'ai'
      else 'user'
    end::public.audit_source,
    coalesce(p_diff, '{}'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Suggestions
-- ---------------------------------------------------------------------------
create table public.request_suggestions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests (id) on delete cascade,
  kind text not null check (kind in ('field', 'access', 'equipment', 'physical')),
  -- field: the request column ("manager_name"); access: "app:<id>";
  -- equipment: "equipment:<type id>"; physical: "access:<type id>".
  target text not null check (length(target) between 1 and 60),
  value jsonb not null check (octet_length(value::text) <= 4000),
  reason text check (length(reason) <= 200),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected', 'replaced')),
  created_by text not null references public.app_users (clerk_user_id),
  created_at timestamptz not null default now(),
  decided_by text references public.app_users (clerk_user_id),
  decided_at timestamptz,
  check ((status = 'pending') = (decided_at is null))
);
create unique index request_suggestions_one_waiting
  on public.request_suggestions (request_id, target) where status = 'pending';
create index request_suggestions_request_idx on public.request_suggestions (request_id, status);
comment on table public.request_suggestions is
  'Values the assistant proposes for a request (F16). Nothing changes until the person accepts; written only by suggest_request_values().';

alter table public.request_suggestions enable row level security;
create policy "request_suggestions: IT side, with their request" on public.request_suggestions
  for select to authenticated
  using (
    (select private.has_any_role(array['admin', 'requester', 'it_operator']::public.app_role[]))
    and exists (select 1 from public.requests r where r.id = request_id)
  );
revoke all on public.request_suggestions from anon, authenticated, service_role;
grant select on public.request_suggestions to authenticated;

-- Request columns a suggestion may fill (sections 1–2 and the offboarding
-- set-up). Never: state, ticket, type, people who sign, section 9.
create function private.suggestion_field_ok(p_target text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_target in (
    'priority', 'first_name', 'last_name', 'work_email', 'job_title', 'department_id',
    'country', 'office_id', 'region_id', 'office_city_id', 'nationalities',
    'manager_name', 'requestor_name', 'effective_date',
    'sla_timeline', 'last_working_day', 'access_cutoff_at', 'handover_to'
  );
$$;
revoke all on function private.suggestion_field_ok(text) from public;
grant execute on function private.suggestion_field_ok(text) to authenticated;

-- The catalog id in "app:12" / "equipment:3" / "access:4" (null when malformed).
create function private.suggestion_target_id(p_target text, p_prefix text)
returns smallint
language sql
immutable
set search_path = ''
as $$
  select case when p_target ~ ('^' || p_prefix || ':[0-9]{1,4}$')
              then split_part(p_target, ':', 2)::smallint end;
$$;
revoke all on function private.suggestion_target_id(text, text) from public;
grant execute on function private.suggestion_target_id(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. The assistant proposes
-- ---------------------------------------------------------------------------
-- p_suggestions: [{ "kind", "target", "value", "reason"? }, …] (1–60).
-- Returns how many were saved. A waiting suggestion for the same target is
-- replaced. Refuses (22023) with words the assistant can act on.
create function public.suggest_request_values(p_request_id uuid, p_suggestions jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user text := private.current_user_id();
  v_state public.request_state;
  v_item jsonb;
  v_kind text;
  v_target text;
  v_id smallint;
  v_count integer := 0;
begin
  if not (private.is_active_user()
          and private.has_any_role(array['admin', 'requester']::public.app_role[])) then
    raise exception 'only admins and requesters can prepare requests' using errcode = '42501';
  end if;
  select state into v_state from public.requests where id = p_request_id;
  if v_state is null then
    raise exception 'request not found' using errcode = '22023';
  end if;
  if v_state not in ('draft', 'in_execution', 'returned') then
    raise exception 'this request can''t be changed any more' using errcode = '22023';
  end if;
  if jsonb_typeof(p_suggestions) <> 'array'
     or jsonb_array_length(p_suggestions) not between 1 and 60 then
    raise exception 'send between 1 and 60 suggestions' using errcode = '22023';
  end if;

  for v_item in select * from jsonb_array_elements(p_suggestions) loop
    v_kind := v_item ->> 'kind';
    v_target := v_item ->> 'target';
    if v_item -> 'value' is null then
      raise exception 'suggestion for % has no value', coalesce(v_target, '?') using errcode = '22023';
    end if;
    if v_kind = 'field' then
      if not coalesce(private.suggestion_field_ok(v_target), false) then
        raise exception 'unknown field %', coalesce(v_target, '?') using errcode = '22023';
      end if;
    elsif v_kind = 'access' then
      v_id := private.suggestion_target_id(v_target, 'app');
      if not exists (select 1 from public.catalog_apps where id = v_id and active) then
        raise exception 'unknown application %', coalesce(v_target, '?') using errcode = '22023';
      end if;
    elsif v_kind = 'equipment' then
      v_id := private.suggestion_target_id(v_target, 'equipment');
      if not exists (select 1 from public.equipment_types where id = v_id and active) then
        raise exception 'unknown equipment type %', coalesce(v_target, '?') using errcode = '22023';
      end if;
    elsif v_kind = 'physical' then
      v_id := private.suggestion_target_id(v_target, 'access');
      if not exists (select 1 from public.physical_access_types where id = v_id and active) then
        raise exception 'unknown access type %', coalesce(v_target, '?') using errcode = '22023';
      end if;
    else
      raise exception 'unknown kind %', coalesce(v_kind, '?') using errcode = '22023';
    end if;
    if v_kind <> 'field' and jsonb_typeof(v_item -> 'value') <> 'object' then
      raise exception 'suggestion for % needs an object value', v_target using errcode = '22023';
    end if;

    update public.request_suggestions
       set status = 'replaced', decided_by = v_user, decided_at = now()
     where request_id = p_request_id and target = v_target and status = 'pending';
    insert into public.request_suggestions (request_id, kind, target, value, reason, created_by)
    values (p_request_id, v_kind, v_target, v_item -> 'value',
            nullif(left(trim(v_item ->> 'reason'), 200), ''), v_user);
    v_count := v_count + 1;
  end loop;

  perform set_config('app.audit_source', 'ai', true);
  perform private.write_audit('request.suggested', 'request', p_request_id::text,
    jsonb_build_object('count', v_count,
      'targets', (select jsonb_agg(x ->> 'target') from jsonb_array_elements(p_suggestions) x)));
  return v_count;
end;
$$;
revoke all on function public.suggest_request_values(uuid, jsonb) from public;
grant execute on function public.suggest_request_values(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. The person accepts or rejects
-- ---------------------------------------------------------------------------
-- Marks a waiting suggestion decided (called by the accept / reject functions).
create function private.decide_suggestion(p_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status not in ('accepted', 'rejected')
     or not private.has_any_role(array['admin', 'requester', 'it_operator']::public.app_role[]) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.request_suggestions
     set status = p_status, decided_by = private.current_user_id(), decided_at = now()
   where id = p_id and status = 'pending';
  if not found then
    raise exception 'this suggestion is no longer waiting' using errcode = '22023';
  end if;
end;
$$;
revoke all on function private.decide_suggestion(uuid, text) from public;
grant execute on function private.decide_suggestion(uuid, text) to authenticated;

-- Saves the value like typing would: the same table writes, under the
-- person's own access (security invoker → RLS, checks and triggers apply).
-- Returns { kind, target, version } — the request's version after the save.
create function public.accept_request_suggestion(p_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  s public.request_suggestions;
  v_id smallint;
  v_version integer;
begin
  select * into s from public.request_suggestions where id = p_id;
  if s.id is null or s.status <> 'pending' then
    raise exception 'this suggestion is no longer waiting' using errcode = '22023';
  end if;

  perform set_config('app.audit_source', 'ai', true);
  if s.kind = 'field' then
    if not private.suggestion_field_ok(s.target) then
      raise exception 'unknown field %', s.target using errcode = '22023';
    end if;
    execute format(
      'update public.requests set %1$I = (jsonb_populate_record(null::public.requests, $1)).%1$I where id = $2',
      s.target)
      using jsonb_build_object(s.target, s.value), s.request_id;
    get diagnostics v_version = row_count;
    if v_version = 0 then
      raise exception 'this request can''t be changed any more' using errcode = '42501';
    end if;
  elsif s.kind = 'access' then
    v_id := private.suggestion_target_id(s.target, 'app');
    update public.request_access_items
       set action = s.value ->> 'action', permission = s.value ->> 'permission',
           notes = s.value ->> 'notes'
     where request_id = s.request_id and app_id = v_id;
    if not found then
      insert into public.request_access_items (request_id, app_id, category_name, app_name, action, permission, notes)
      values (s.request_id, v_id, '', '-', s.value ->> 'action', s.value ->> 'permission', s.value ->> 'notes');
    end if;
  elsif s.kind = 'equipment' then
    v_id := private.suggestion_target_id(s.target, 'equipment');
    insert into public.request_equipment_items (request_id, type_id, type_name, action, description, notes)
    values (s.request_id, v_id, '-', s.value ->> 'action', s.value ->> 'description', s.value ->> 'notes');
  else
    v_id := private.suggestion_target_id(s.target, 'access');
    update public.request_physical_access_items
       set action = s.value ->> 'action', scope = s.value ->> 'scope', notes = s.value ->> 'notes'
     where request_id = s.request_id and type_id = v_id;
    if not found then
      insert into public.request_physical_access_items (request_id, type_id, type_name, action, scope, notes)
      values (s.request_id, v_id, '-', s.value ->> 'action', s.value ->> 'scope', s.value ->> 'notes');
    end if;
  end if;

  perform private.decide_suggestion(p_id, 'accepted');
  select version into v_version from public.requests where id = s.request_id;
  return jsonb_build_object('kind', s.kind, 'target', s.target, 'version', v_version);
end;
$$;
revoke all on function public.accept_request_suggestion(uuid) from public;
grant execute on function public.accept_request_suggestion(uuid) to authenticated;

create function public.reject_request_suggestion(p_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Only suggestions the person can see (RLS) on a request they may still edit.
  if not exists (select 1 from public.request_suggestions s
                 join public.requests r on r.id = s.request_id
                 where s.id = p_id and r.state in ('draft', 'in_execution', 'returned')) then
    raise exception 'this suggestion is no longer waiting' using errcode = '22023';
  end if;
  perform private.decide_suggestion(p_id, 'rejected');
end;
$$;
revoke all on function public.reject_request_suggestion(uuid) from public;
grant execute on function public.reject_request_suggestion(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. A draft created by the assistant (after the person's Confirm)
-- ---------------------------------------------------------------------------
-- Same paths as the New request sheet (RLS and the create functions' own
-- checks), audited source = ai. Returns the new request's id.
create function public.ai_start_request(
  p_type public.request_type,
  p_employee_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform set_config('app.audit_source', 'ai', true);
  if p_type = 'onboarding' then
    if p_employee_id is not null then
      raise exception 'an onboarding starts without a person' using errcode = '22023';
    end if;
    insert into public.requests (created_by) values (private.current_user_id())
    returning id into v_id;
  elsif p_type = 'offboarding' then
    v_id := public.create_offboarding(p_employee_id);
  else
    v_id := public.create_access_modification(p_employee_id);
  end if;
  return v_id;
end;
$$;
revoke all on function public.ai_start_request(public.request_type, uuid) from public;
grant execute on function public.ai_start_request(public.request_type, uuid) to authenticated;

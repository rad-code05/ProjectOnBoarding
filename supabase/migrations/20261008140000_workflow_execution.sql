-- F04a — Workflow states and section 9 (IT execution confirmation).
--
--   * Request states change ONLY through public.transition_request(). It
--     checks the move, the caller's role and the extra rules (reason,
--     checklist complete, nobody confirms their own request), stamps the
--     server time and writes one audit event. A direct UPDATE of the state —
--     or of the timestamps it sets — is still refused.
--   * Moves (decided 2026-10-08):
--       draft                → in_execution          IT side (Start execution; no way back)
--       in_execution         → pending_confirmation  IT operator / admin, checklist complete (F06 adds the signature)
--       returned             → pending_confirmation  same
--       pending_confirmation → closed                approver, not the creator or executor (F07 adds the signature)
--       pending_confirmation → returned              approver, reason required
--       draft / in_execution / pending_confirmation / returned → cancelled
--                                                   admin / requester, reason required
--   * Section 9 checklist items are DATA (per ticket type); the request's
--     answers live in execution_confirmations, editable while the request is
--     in execution or returned. "Executed by" is whoever saved it last.

-- ---------------------------------------------------------------------------
-- 1. Request columns set by the workflow
-- ---------------------------------------------------------------------------
alter table public.requests
  add column state_changed_at timestamptz,
  add column execution_started_at timestamptz,
  add column cancelled_at timestamptz,
  add column cancelled_by text references public.app_users (clerk_user_id),
  add column cancel_reason text check (length(cancel_reason) <= 500),
  add column return_reason text check (length(return_reason) <= 1000);

comment on column public.requests.execution_started_at is 'Set by the database when Raju starts execution; never edited.';

-- The update guard: workflow columns change only inside transition_request().
create or replace function private.request_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_in_transition boolean := coalesce(current_setting('app.request_transition', true), '') = 'on';
begin
  if new.ticket_id is distinct from old.ticket_id
     or new.ticket_year is distinct from old.ticket_year
     or new.ticket_number is distinct from old.ticket_number
     or new.created_by is distinct from old.created_by
     or new.form_version_id is distinct from old.form_version_id then
    raise exception 'ticket ID, creator and form version cannot be changed'
      using errcode = 'insufficient_privilege';
  end if;
  if not v_in_transition and (
       new.state is distinct from old.state
       or new.state_changed_at is distinct from old.state_changed_at
       or new.execution_started_at is distinct from old.execution_started_at
       or new.closed_at is distinct from old.closed_at
       or new.cancelled_at is distinct from old.cancelled_at
       or new.cancelled_by is distinct from old.cancelled_by
       or new.cancel_reason is distinct from old.cancel_reason
       or new.return_reason is distinct from old.return_reason) then
    raise exception 'request state changes go through the workflow (transition_request)'
      using errcode = 'insufficient_privilege';
  end if;
  new.created_at := old.created_at;
  new.updated_at := now();
  new.version := old.version + 1;
  return new;
end;
$$;

-- The field-by-field audit leaves the workflow columns to request.state_changed.
create or replace function private.audit_requests()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_changes jsonb;
begin
  if tg_op = 'INSERT' then
    perform private.write_audit('request.created', 'request', new.id::text,
      jsonb_build_object('ticket_id', new.ticket_id, 'type', new.type));
    return null;
  end if;

  select jsonb_object_agg(n.key, jsonb_build_object('before', o.value, 'after', n.value))
  into v_changes
  from jsonb_each(to_jsonb(new)) n
  join jsonb_each(to_jsonb(old)) o using (key)
  where n.value is distinct from o.value
    and n.key not in ('version', 'updated_at', 'employee_id', 'state', 'state_changed_at',
                      'execution_started_at', 'closed_at', 'cancelled_at', 'cancelled_by',
                      'cancel_reason', 'return_reason');

  if v_changes is not null then
    perform private.write_audit('request.updated', 'request', new.id::text,
      jsonb_build_object('ticket_id', new.ticket_id, 'changes', v_changes));
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Section 9 checklist items (data) and the request's confirmation
-- ---------------------------------------------------------------------------
create table public.execution_checklist_items (
  id smallint generated always as identity primary key,
  key text not null unique check (key ~ '^[a-z][a-z0-9_]*$'),
  label text not null check (length(trim(label)) > 0),
  applies_to public.request_type[] not null,
  sort_order smallint not null default 0,
  active boolean not null default true
);
comment on table public.execution_checklist_items is 'Section 9 checklist items per ticket type (data, not code).';

insert into public.execution_checklist_items (key, label, applies_to, sort_order) values
  ('access_provisioned', 'All authorised access provisioned or modified', '{onboarding,access_modification}', 10),
  ('access_removed', 'All access removed', '{offboarding}', 20),
  ('devices_enrolled', 'Devices issued and enrolled (MDM)', '{onboarding,access_modification}', 30),
  ('devices_recovered', 'Devices recovered', '{offboarding}', 40),
  ('security_controls', 'Security controls applied (MFA, MDM, EDR)', '{onboarding,offboarding,access_modification}', 50);

create table public.execution_confirmations (
  request_id uuid primary key references public.requests (id),
  -- { "<item key>": true | false } for the items of the request's type.
  checks jsonb not null default '{}'::jsonb check (jsonb_typeof(checks) = 'object'),
  notes text check (length(notes) <= 2000),
  executed_by text not null references public.app_users (clerk_user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.execution_confirmations is 'Section 9 of a request: checklist answers, implementation notes, executed by (set by the database).';

create function private.execution_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type public.request_type;
  v_bad text;
begin
  if tg_op = 'UPDATE' and new.request_id is distinct from old.request_id then
    raise exception 'the request of a confirmation cannot change' using errcode = 'insufficient_privilege';
  end if;
  select r.type into v_type from public.requests r where r.id = new.request_id;
  select k into v_bad
  from jsonb_each(new.checks) as c(k, v)
  where jsonb_typeof(v) <> 'boolean'
     or not exists (select 1 from public.execution_checklist_items i
                    where i.key = k and i.active and v_type = any (i.applies_to))
  limit 1;
  if v_bad is not null then
    raise exception 'checklist item % does not apply to this request', v_bad using errcode = 'check_violation';
  end if;
  new.notes := nullif(trim(new.notes), '');
  new.executed_by := coalesce(private.current_user_id(), new.executed_by);
  new.created_at := case when tg_op = 'INSERT' then now() else old.created_at end;
  new.updated_at := now();
  return new;
end;
$$;
create trigger execution_confirmations_before_write
before insert or update on public.execution_confirmations
for each row execute function private.execution_before_write();

create function private.audit_execution()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or (old.checks, old.notes) is distinct from (new.checks, new.notes) then
    perform private.write_audit('request.execution_updated', 'request', new.request_id::text,
      jsonb_build_object(
        'before', case when tg_op = 'UPDATE' then jsonb_build_object('checks', old.checks, 'notes', old.notes) end,
        'after', jsonb_build_object('checks', new.checks, 'notes', new.notes)));
  end if;
  return null;
end;
$$;
create trigger execution_confirmations_audit
after insert or update on public.execution_confirmations
for each row execute function private.audit_execution();

-- True when every active checklist item of the request's type is ticked.
create function private.execution_complete(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(bool_and(coalesce((c.checks ->> i.key)::boolean, false)), false)
  from public.requests r
  join public.execution_checklist_items i on i.active and r.type = any (i.applies_to)
  left join public.execution_confirmations c on c.request_id = r.id
  where r.id = p_request_id
$$;

-- ---------------------------------------------------------------------------
-- 3. The state machine
-- ---------------------------------------------------------------------------
create function public.transition_request(
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
comment on function public.transition_request(uuid, public.request_state, text) is 'The only way to change a request''s state: checks the move, role and rules, stamps server time, audits.';

-- ---------------------------------------------------------------------------
-- 4. Row Level Security and grants
-- ---------------------------------------------------------------------------
alter table public.execution_checklist_items enable row level security;
alter table public.execution_confirmations enable row level security;

create policy "execution_checklist_items: active users read" on public.execution_checklist_items
for select to authenticated using ((select private.is_active_user()));

create policy "execution_confirmations: visible with their request" on public.execution_confirmations
for select to authenticated
using (exists (select 1 from public.requests r where r.id = request_id));

create policy "execution_confirmations: IT side writes while executing" on public.execution_confirmations
for insert to authenticated
with check (
  (select private.has_any_role(array['admin', 'requester', 'it_operator']::public.app_role[]))
  and exists (select 1 from public.requests r where r.id = request_id and r.state in ('in_execution', 'returned'))
);
create policy "execution_confirmations: IT side changes while executing" on public.execution_confirmations
for update to authenticated
using (
  (select private.has_any_role(array['admin', 'requester', 'it_operator']::public.app_role[]))
  and exists (select 1 from public.requests r where r.id = request_id and r.state in ('in_execution', 'returned'))
)
with check (
  (select private.has_any_role(array['admin', 'requester', 'it_operator']::public.app_role[]))
);

revoke all on public.execution_checklist_items, public.execution_confirmations from anon, authenticated, service_role;
grant select on public.execution_checklist_items to authenticated;
grant select, insert, update on public.execution_confirmations to authenticated;
grant select on public.execution_checklist_items, public.execution_confirmations to service_role;

revoke all on function public.transition_request(uuid, public.request_state, text) from public, anon;
grant execute on function public.transition_request(uuid, public.request_state, text) to authenticated;
revoke all on function private.execution_complete(uuid) from public;

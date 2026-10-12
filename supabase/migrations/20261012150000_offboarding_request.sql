-- F09b-1 — The offboarding request: section 8 (access removal SLA), handover,
-- "Who is leaving?" pre-filled from the access inventory (F09a).
--
-- Decided 2026-10-12 (boards approved):
--   * Timeline Same day / within 24h / within 48h. Deadline (sla_due_at),
--     worked out by the database in the COMPANY timezone (D3): Same day =
--     23:59:59 of the cut-off day; 24h / 48h = cut-off + 24 / 48 hours.
--   * Timeline, cut-off and last working day are needed to start execution
--     and are FIXED from then on (the deadline too, even if the company
--     timezone changes later).
--   * One open offboarding per person. People not in the app yet: an empty
--     offboarding, filled by hand (until the F24 import).
--   * Offboarding rows only remove: applications Remove, equipment Return,
--     access Disable / Remove — also for retired catalog items and for
--     permissions / scopes no longer offered (a leaver may still hold them).
-- F09b-2 adds the removal ticks, equipment return, mailbox and met / missed.

-- ---------------------------------------------------------------------------
-- 1. Section 8 and handover on the request
-- ---------------------------------------------------------------------------
create type public.sla_timeline as enum ('same_day', 'within_24h', 'within_48h');

alter table public.requests
  add column sla_timeline public.sla_timeline,
  add column last_working_day date,
  add column access_cutoff_at timestamptz,
  add column sla_due_at timestamptz,
  add column handover_to text check (length(handover_to) <= 120),
  add constraint requests_offboarding_fields check (
    type = 'offboarding'
    or (sla_timeline is null and last_working_day is null and access_cutoff_at is null
        and sla_due_at is null and handover_to is null)
  );

comment on column public.requests.sla_due_at is 'Access removal deadline, set by the database from the timeline and cut-off (company timezone); fixed once execution starts.';
comment on column public.requests.handover_to is 'Offboarding: who receives the leaver''s data and mailbox (typed name).';

-- One open offboarding per person (whatever path created it).
create unique index requests_one_open_offboarding on public.requests (employee_id)
  where type = 'offboarding' and state in ('draft', 'in_execution', 'pending_confirmation', 'returned');

create function private.sla_deadline(p_timeline public.sla_timeline, p_cutoff timestamptz)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select case p_timeline
    when 'same_day' then
      (((p_cutoff at time zone private.company_timezone())::date + 1)::timestamp
        at time zone private.company_timezone()) - interval '1 second'
    when 'within_24h' then p_cutoff + interval '24 hours'
    when 'within_48h' then p_cutoff + interval '48 hours'
  end;
$$;
comment on function private.sla_deadline(public.sla_timeline, timestamptz) is 'Same day = 23:59:59 of the cut-off day in the company timezone; 24h / 48h after the cut-off.';

create function private.request_offboarding_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.type is distinct from old.type and 'offboarding' in (new.type, old.type) then
      raise exception 'an offboarding is started from New request and stays an offboarding'
        using errcode = 'check_violation';
    end if;
    if old.state <> 'draft' then
      if new.sla_timeline is distinct from old.sla_timeline
         or new.access_cutoff_at is distinct from old.access_cutoff_at
         or new.last_working_day is distinct from old.last_working_day then
        raise exception 'the access removal SLA is fixed once execution starts'
          using errcode = 'check_violation';
      end if;
      new.sla_due_at := old.sla_due_at;
      return new;
    end if;
    if new.state = 'in_execution' and new.type = 'offboarding'
       and (new.sla_timeline is null or new.access_cutoff_at is null or new.last_working_day is null) then
      raise exception 'set the access removal SLA (timeline, last working day and cut-off) before starting execution'
        using errcode = 'check_violation';
    end if;
  elsif new.type = 'offboarding' and new.state <> 'draft' then
    raise exception 'an offboarding starts as a draft' using errcode = 'check_violation';
  end if;
  new.handover_to := nullif(trim(new.handover_to), '');
  new.sla_due_at := private.sla_deadline(new.sla_timeline, new.access_cutoff_at);
  return new;
end;
$$;

create trigger requests_c_offboarding_rules before insert or update on public.requests
for each row execute function private.request_offboarding_rules();

-- ---------------------------------------------------------------------------
-- 2. Offboarding rows only remove (sections 5–7)
-- ---------------------------------------------------------------------------
create function private.request_is_offboarding(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.requests where id = p_request_id and type = 'offboarding');
$$;

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
  if new.permission is not null and not (new.permission = any (v_app.permissions)) then
    raise exception 'permission % is not offered for %', new.permission, v_app.name
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create or replace function private.equipment_item_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type public.equipment_types;
  v_offboarding boolean := private.request_is_offboarding(new.request_id);
begin
  if tg_op = 'UPDATE' and new.request_id is distinct from old.request_id then
    raise exception 'the request of a row cannot change' using errcode = 'insufficient_privilege';
  end if;
  select t.* into v_type from public.equipment_types t where t.id = new.type_id;
  if tg_op = 'INSERT' or new.type_id is distinct from old.type_id then
    if not v_type.active and not v_offboarding then
      raise exception 'equipment type % is retired', v_type.name using errcode = 'check_violation';
    end if;
    new.type_name := v_type.name;
  else
    new.type_name := old.type_name;
  end if;
  new.description := nullif(trim(new.description), '');
  new.asset_tag := nullif(trim(new.asset_tag), '');
  if v_offboarding then
    if new.action <> 'Return' then
      raise exception 'an offboarding only returns equipment' using errcode = 'check_violation';
    end if;
  else
    if not (new.action = any (v_type.actions)) then
      raise exception 'action % is not offered for %', new.action, v_type.name using errcode = 'check_violation';
    end if;
    if v_type.needs_description and new.description is null then
      raise exception '% needs a description', v_type.name using errcode = 'check_violation';
    end if;
  end if;
  new.created_at := case when tg_op = 'INSERT' then now() else old.created_at end;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.physical_item_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type public.physical_access_types;
  v_offboarding boolean := private.request_is_offboarding(new.request_id);
begin
  if tg_op = 'UPDATE' and (new.request_id is distinct from old.request_id
                           or new.type_id is distinct from old.type_id) then
    raise exception 'the request and the type of a row cannot change' using errcode = 'insufficient_privilege';
  end if;
  select t.* into v_type from public.physical_access_types t where t.id = new.type_id;
  if tg_op = 'INSERT' then
    if not v_type.active and not v_offboarding then
      raise exception 'access type % is retired', v_type.name using errcode = 'check_violation';
    end if;
    new.type_name := v_type.name;
  else
    new.type_name := old.type_name;
  end if;
  if v_offboarding then
    if new.action not in ('Disable', 'Remove') then
      raise exception 'an offboarding only disables or removes access' using errcode = 'check_violation';
    end if;
  else
    if not (new.action = any (v_type.actions)) then
      raise exception 'action % is not offered for %', new.action, v_type.name using errcode = 'check_violation';
    end if;
    if new.scope is not null and not (new.scope = any (v_type.scopes)) then
      raise exception 'scope % is not offered for %', new.scope, v_type.name using errcode = 'check_violation';
    end if;
  end if;
  new.created_at := case when tg_op = 'INSERT' then now() else old.created_at end;
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. "Who is leaving?" — a draft pre-filled from the access inventory
-- ---------------------------------------------------------------------------
create function public.create_offboarding(p_employee_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user text := private.current_user_id();
  v_employee public.employees;
  v_last public.requests;
  v_open text;
  v_id uuid;
  v_apps integer := 0;
  v_equipment integer := 0;
  v_access integer := 0;
begin
  if v_user is null or not private.is_active_user()
     or not private.has_any_role(array['admin', 'requester']::public.app_role[]) then
    raise exception 'only the IT side starts an offboarding' using errcode = 'insufficient_privilege';
  end if;

  if p_employee_id is not null then
    select * into v_employee from public.employees where id = p_employee_id;
    if not found then
      raise exception 'person not found' using errcode = 'no_data_found';
    end if;
    select ticket_id into v_open from public.requests
    where employee_id = p_employee_id and type = 'offboarding'
      and state in ('draft', 'in_execution', 'pending_confirmation', 'returned');
    if v_open is not null then
      raise exception 'an offboarding is already open for this person (%)', v_open
        using errcode = 'check_violation';
    end if;
    -- Section 2 from the person's latest closed request (their last known details).
    select * into v_last from public.requests
    where employee_id = p_employee_id and state = 'closed'
    order by closed_at desc limit 1;
  end if;

  insert into public.requests
    (created_by, type, first_name, last_name, work_email, job_title, department_id, country,
     manager_name, requestor_name)
  values
    (v_user, 'offboarding', coalesce(v_last.first_name, v_employee.first_name),
     coalesce(v_last.last_name, v_employee.last_name), v_employee.work_email, v_last.job_title,
     v_last.department_id, v_last.country, v_last.manager_name, v_last.requestor_name)
  returning id into v_id;

  if p_employee_id is not null then
    insert into public.request_access_items (request_id, app_id, app_name, action, permission)
    select v_id, i.app_id, i.name, 'Remove', i.permission
    from public.employee_access_inventory i
    where i.employee_id = p_employee_id and i.kind = 'application' and i.ended_at is null
    order by i.category_name, i.name;
    get diagnostics v_apps = row_count;

    insert into public.request_equipment_items (request_id, type_id, action, description, asset_tag)
    select v_id, i.equipment_type_id, 'Return', i.description, i.asset_tag
    from public.employee_access_inventory i
    where i.employee_id = p_employee_id and i.kind = 'equipment' and i.ended_at is null
    order by i.granted_at, i.id;
    get diagnostics v_equipment = row_count;

    insert into public.request_physical_access_items (request_id, type_id, action, scope)
    select v_id, i.access_type_id,
      case when 'Disable' = any (t.actions) then 'Disable' else 'Remove' end, i.permission
    from public.employee_access_inventory i
    join public.physical_access_types t on t.id = i.access_type_id
    where i.employee_id = p_employee_id and i.kind = 'access' and i.ended_at is null;
    get diagnostics v_access = row_count;
  end if;

  perform private.write_audit('request.offboarding_started', 'request', v_id::text,
    jsonb_build_object('employee_id', p_employee_id,
      'prefilled', jsonb_build_object('applications', v_apps, 'equipment', v_equipment, 'access', v_access)));
  return v_id;
end;
$$;
comment on function public.create_offboarding(uuid) is 'IT side: new offboarding draft for a person (or empty with null), section 2 from their last closed request, removals pre-filled from the access inventory; one open offboarding per person; audited.';

-- ---------------------------------------------------------------------------
-- 4. Grants
-- ---------------------------------------------------------------------------
grant usage on type public.sla_timeline to authenticated, service_role;

revoke all on function private.sla_deadline(public.sla_timeline, timestamptz) from public;
revoke all on function private.request_offboarding_rules() from public;
revoke all on function private.request_is_offboarding(uuid) from public;
revoke all on function public.create_offboarding(uuid) from public, anon;
grant execute on function public.create_offboarding(uuid) to authenticated;

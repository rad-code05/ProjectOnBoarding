-- F24f-1 — Employee or contractor (the database part). Decided with Raju
-- 2026-11-06 (board *Section 2 with Employee / Contractor*, approved).
--
--   * requests.worker_type: 'employee' or 'contractor' (section 2). Requests
--     made before this migration are back-filled as employees, except one
--     waiting for the approver (its signed snapshot must stay the same).
--   * Office stays required for an employee; a contractor may have none
--     (shown as "No office", reported as "Office not set").
--   * Form v4.3 = v4.2 + "Employee or contractor" (required, first in
--     section 2) — added here but NOT current: F24f-2 publishes it with the
--     screen, as F27 did with v4.2.
--   * Snapshot: worker_type only when filled (older signed requests keep the
--     same snapshot); an access change shows what it was ("Was: Contractor").
--   * Offboarding / access change copy it from the last closed request; a
--     contractor who becomes an employee = an access change that switches it.
--   * The assistant may suggest it; the staff import takes it (default
--     employee; an employee needs an office).
--   * Department Legal.
--
-- Every function below is the latest version (see the migration named above
-- it) with only the worker_type lines added.

-- ---------------------------------------------------------------------------
-- 1. The column, the back-fill and the department
-- ---------------------------------------------------------------------------
alter table public.requests
  add column worker_type text check (worker_type in ('employee', 'contractor'));
comment on column public.requests.worker_type is
  'Employee or contractor (F24f); required from form v4.3 on. A contractor may have no office.';

-- Existing requests were all employees (the field didn't exist). Not one that
-- waits for the approver: its signed snapshot must still match at Confirm.
-- Updated with the triggers off: the back-fill is not a person's edit (no
-- version bump, no request.updated per row) — one audit event instead.
alter table public.requests disable trigger user;
with done as (
  update public.requests set worker_type = 'employee'
  where worker_type is null and state <> 'pending_confirmation'
  returning 1
)
select private.write_audit('request.worker_type_backfilled', 'request', null,
  jsonb_build_object('requests', (select count(*) from done), 'value', 'employee'));
alter table public.requests enable trigger user;

insert into public.departments (name, sort_order)
values ('Legal', 90)
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Form v4.3 (not current yet — F24f-2 publishes it with the screen)
-- ---------------------------------------------------------------------------
alter table public.form_fields drop constraint form_fields_field_type_check;
alter table public.form_fields add constraint form_fields_field_type_check check (field_type in (
  'text', 'email', 'date', 'select', 'department', 'country', 'user', 'system',
  'office', 'region', 'office_city', 'nationality', 'worker_type'));

insert into public.form_versions (version, is_current) values ('4.3', false);

insert into public.form_fields
  (form_version_id, key, label, section, field_type, storage, required, options, help_text,
   applies_to, sort_order)
select v.id, f.key, f.label, f.section, f.field_type, f.storage, f.required, f.options,
  case when f.key = 'office' then 'Where they work. Fills the country (still editable). A contractor may have no office.'
       else f.help_text end,
  f.applies_to, f.sort_order
from public.form_fields f
join public.form_versions old on old.id = f.form_version_id and old.version = '4.2'
cross join public.form_versions v
where v.version = '4.3';

insert into public.form_fields
  (form_version_id, key, label, section, field_type, required, options, help_text, sort_order)
select v.id, 'worker_type', 'Employee or contractor', 2, 'worker_type', true,
  '["employee", "contractor"]'::jsonb, 'A contractor may have no office.', 5
from public.form_versions v
where v.version = '4.3';

-- ---------------------------------------------------------------------------
-- 3. Required fields: Office not for a contractor
--    (latest: 20261021120000_offices.sql)
-- ---------------------------------------------------------------------------
create or replace function private.missing_required_fields(p_request_id uuid)
returns text[]
language sql
stable
set search_path = ''
as $$
  select coalesce(array_agg(f.label order by f.section, f.sort_order), '{}')
         || private.offboarding_blockers(p_request_id)
         || private.access_change_blockers(p_request_id)
  from public.requests r
  join public.form_fields f on f.form_version_id = r.form_version_id
  where r.id = p_request_id
    and f.required
    and f.field_type <> 'system'
    and r.type = any (f.applies_to)
    -- F24f: a contractor may have no office (shown as "No office").
    and (f.key <> 'office' or r.worker_type is distinct from 'contractor')
    and nullif(trim(case
          when f.storage = 'custom' then r.custom_fields ->> f.key
          else to_jsonb(r) ->> case f.key
            when 'department' then 'department_id'
            when 'assignee' then 'assignee_id'
            when 'office' then 'office_id'
            when 'region' then 'region_id'
            when 'office_city' then 'office_city_id'
            else f.key end
        end), '') is null;
$$;

-- ---------------------------------------------------------------------------
-- 4. Snapshot: worker_type only when filled; "Was" on an access change
--    (latest: 20261021120000_offices.sql)
-- ---------------------------------------------------------------------------
create or replace function private.request_snapshot_data(p_request_id uuid)
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
    ) || jsonb_strip_nulls(jsonb_build_object(
      'worker_type', r.worker_type,
      'office', o.name,
      'region', rg.name,
      'office_city', oc.name,
      'nationalities', to_jsonb(r.nationalities))),
    'access', coalesce((
      select jsonb_agg(jsonb_build_object(
        'category', a.category_name, 'app', a.app_name, 'action', a.action,
        'permission', a.permission, 'notes', a.notes)
        || case when r.type = 'offboarding' then jsonb_build_object(
             'removal_method', a.removal_method, 'done_at', private.utc_text(a.done_at),
             'done_by_name', private.user_name(a.done_by)) else '{}'::jsonb end
        || case when a.inventory_id is not null then jsonb_build_object(
             'had', (select h.permission from public.employee_access_inventory h where h.id = a.inventory_id))
           else '{}'::jsonb end
        order by a.created_at, a.id)
      from public.request_access_items a where a.request_id = r.id), '[]'::jsonb),
    'equipment', coalesce((
      select jsonb_agg(jsonb_build_object(
        'type', e.type_name, 'action', e.action, 'description', e.description,
        'asset_tag', e.asset_tag, 'notes', e.notes)
        || case when r.type = 'offboarding' then jsonb_build_object(
             'return_status', e.return_status, 'return_reason', e.return_reason,
             'return_recorded_at', private.utc_text(e.return_recorded_at)) else '{}'::jsonb end
        order by e.created_at, e.id)
      from public.request_equipment_items e where e.request_id = r.id), '[]'::jsonb),
    'physical_access', coalesce((
      select jsonb_agg(jsonb_build_object(
        'type', p.type_name, 'action', p.action, 'scope', p.scope, 'notes', p.notes)
        || case when r.type = 'offboarding' then jsonb_build_object(
             'done_at', private.utc_text(p.done_at), 'done_by_name', private.user_name(p.done_by))
           else '{}'::jsonb end
        || case when p.inventory_id is not null then jsonb_build_object(
             'had', (select h.permission from public.employee_access_inventory h where h.id = p.inventory_id))
           else '{}'::jsonb end
        order by p.created_at, p.id)
      from public.request_physical_access_items p where p.request_id = r.id), '[]'::jsonb),
    'execution', (
      select jsonb_build_object(
        'checks', c.checks, 'notes', c.notes,
        'executed_by', c.executed_by, 'executed_by_name', private.user_name(c.executed_by))
      from public.execution_confirmations c where c.request_id = r.id)
  )
  || case when r.type = 'offboarding' then jsonb_build_object(
       'offboarding', jsonb_build_object(
         'sla_timeline', r.sla_timeline::text,
         'last_working_day', r.last_working_day::text,
         'access_cutoff_at', private.utc_text(r.access_cutoff_at),
         'sla', private.request_sla(r.id),
         'sla_missed_reason', r.sla_missed_reason,
         'handover_to', r.handover_to,
         'mailbox_handling', r.mailbox_handling,
         'mailbox_recorded_at', private.utc_text(r.mailbox_recorded_at)))
     else '{}'::jsonb end
  || case when r.type = 'access_modification' then jsonb_build_object(
       'access_modification', jsonb_build_object(
         -- Section 2 as it was (the person's previous closed request).
         'previous', (
           select jsonb_build_object(
             'ticket_id', p.ticket_id, 'job_title', p.job_title, 'department', pd.name,
             'country', p.country, 'manager_name', p.manager_name)
             || jsonb_strip_nulls(jsonb_build_object(
               'worker_type', p.worker_type, 'office', po.name, 'region', prg.name, 'office_city', poc.name,
               'nationalities', to_jsonb(p.nationalities)))
           from public.requests p
           left join public.departments pd on pd.id = p.department_id
           left join public.offices po on po.id = p.office_id
           left join public.country_regions prg on prg.id = p.region_id
           left join public.office_cities poc on poc.id = p.office_city_id
           where p.employee_id = r.employee_id and p.state = 'closed' and p.id <> r.id
           order by p.closed_at desc limit 1),
         -- Everything held that this request leaves as it is.
         'kept', coalesce((
           select jsonb_agg(jsonb_build_object(
             'kind', k.kind::text, 'category', k.category_name, 'name', k.name,
             'permission', k.permission, 'asset_tag', k.asset_tag, 'description', k.description)
             order by k.kind, k.category_name nulls last, k.name, k.id)
           from public.employee_access_inventory k
           where k.employee_id = r.employee_id and k.ended_at is null
             and not exists (select 1 from public.request_access_items x where x.request_id = r.id and x.inventory_id = k.id)
             and not exists (select 1 from public.request_equipment_items x where x.request_id = r.id and x.inventory_id = k.id)
             and not exists (select 1 from public.request_physical_access_items x where x.request_id = r.id and x.inventory_id = k.id)
         ), '[]'::jsonb)))
     else '{}'::jsonb end
  from public.requests r
  join public.form_versions fv on fv.id = r.form_version_id
  left join public.departments d on d.id = r.department_id
  left join public.offices o on o.id = r.office_id
  left join public.country_regions rg on rg.id = r.region_id
  left join public.office_cities oc on oc.id = r.office_city_id
  where r.id = p_request_id;
$$;

-- ---------------------------------------------------------------------------
-- 5. Offboarding / access change copy it from the last closed request
--    (latest: 20261021120000_offices.sql)
-- ---------------------------------------------------------------------------
create or replace function public.create_offboarding(p_employee_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user text := private.current_user_id();
  v_employee public.employees;
  v_last public.requests;
  v_place record;
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
  select * into v_place from private.active_place(v_last.office_id, v_last.region_id, v_last.office_city_id);

  insert into public.requests
    (created_by, type, first_name, last_name, work_email, job_title, department_id, country,
     manager_name, requestor_name, office_id, region_id, office_city_id, nationalities, worker_type)
  values
    (v_user, 'offboarding', coalesce(v_last.first_name, v_employee.first_name),
     coalesce(v_last.last_name, v_employee.last_name), v_employee.work_email, v_last.job_title,
     v_last.department_id, v_last.country, v_last.manager_name, v_last.requestor_name,
     v_place.office_id, v_place.region_id, v_place.office_city_id, v_last.nationalities, v_last.worker_type)
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

create or replace function public.create_access_modification(p_employee_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user text := private.current_user_id();
  v_employee public.employees;
  v_last public.requests;
  v_place record;
  v_open record;
  v_id uuid;
begin
  if v_user is null or not private.is_active_user()
     or not private.has_any_role(array['admin', 'requester']::public.app_role[]) then
    raise exception 'only the IT side starts an access change' using errcode = 'insufficient_privilege';
  end if;

  if p_employee_id is not null then
    select * into v_employee from public.employees where id = p_employee_id;
    if not found then
      raise exception 'person not found' using errcode = 'no_data_found';
    end if;
    -- One open access change per person, and none while they are leaving.
    select ticket_id, type into v_open from public.requests
    where employee_id = p_employee_id and type in ('access_modification', 'offboarding')
      and state in ('draft', 'in_execution', 'pending_confirmation', 'returned')
    order by type limit 1;
    if found then
      if v_open.type = 'offboarding' then
        raise exception 'this person is leaving — an offboarding is open (%)', v_open.ticket_id
          using errcode = 'check_violation';
      end if;
      raise exception 'an access change is already open for this person (%)', v_open.ticket_id
        using errcode = 'check_violation';
    end if;
    -- Section 2 from the person's latest closed request (editable: a new role).
    select * into v_last from public.requests
    where employee_id = p_employee_id and state = 'closed'
    order by closed_at desc limit 1;
  end if;
  select * into v_place from private.active_place(v_last.office_id, v_last.region_id, v_last.office_city_id);

  insert into public.requests
    (created_by, type, first_name, last_name, work_email, job_title, department_id, country,
     manager_name, requestor_name, office_id, region_id, office_city_id, nationalities, worker_type)
  values
    (v_user, 'access_modification', coalesce(v_last.first_name, v_employee.first_name),
     coalesce(v_last.last_name, v_employee.last_name), v_employee.work_email, v_last.job_title,
     v_last.department_id, v_last.country, v_last.manager_name, v_last.requestor_name,
     v_place.office_id, v_place.region_id, v_place.office_city_id, v_last.nationalities, v_last.worker_type)
  returning id into v_id;

  perform private.write_audit('request.access_change_started', 'request', v_id::text,
    jsonb_build_object('employee_id', p_employee_id,
      'held', (select count(*) from public.employee_access_inventory
               where employee_id = p_employee_id and ended_at is null)));
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. The assistant may suggest it (latest: 20261025130000_request_suggestions.sql)
-- ---------------------------------------------------------------------------
create or replace function private.suggestion_field_ok(p_target text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_target in (
    'priority', 'first_name', 'last_name', 'work_email', 'job_title', 'department_id',
    'country', 'worker_type', 'office_id', 'region_id', 'office_city_id', 'nationalities',
    'manager_name', 'requestor_name', 'effective_date',
    'sla_timeline', 'last_working_day', 'access_cutoff_at', 'handover_to'
  );
$$;

-- ---------------------------------------------------------------------------
-- 7. The staff import takes it (latest: 20261105130000_staff_import.sql)
--    `person` gains worker_type ('employee' | 'contractor', default employee).
-- ---------------------------------------------------------------------------
create or replace function public.import_staff(p_import uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin text := private.require_admin();
  v_tz text := private.company_timezone();
  v_today date := (now() at time zone private.company_timezone())::date;
  v_import public.staff_imports;
  v_row public.staff_import_rows;
  v_p jsonb;
  v_email text;
  v_office public.offices;
  v_kind text;
  v_start date;
  v_leave date;
  v_start_at timestamptz;
  v_leave_at timestamptz;
  v_on uuid;
  v_off uuid;
  v_employee uuid;
  v_tickets text[];
  v_a jsonb;
  v_app public.catalog_apps;
  v_category text;
  v_since date;
  v_count integer;
  v_people integer := 0;
  v_leavers integer := 0;
  v_access integer := 0;
  v_counts jsonb;
begin
  select * into v_import from public.staff_imports where id = p_import for update;
  if not found then
    raise exception 'unknown import' using errcode = 'no_data_found';
  end if;
  if v_import.status <> 'open' then
    raise exception 'this import is finished already' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.staff_import_rows r
             where r.import_id = p_import and r.included and jsonb_array_length(r.problems) > 0) then
    raise exception 'fix or leave out the rows that need attention first' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.staff_import_rows r where r.import_id = p_import and r.included) then
    raise exception 'there is nobody to import' using errcode = 'check_violation';
  end if;

  perform set_config('app.importing', 'on', true);

  for v_row in
    select * from public.staff_import_rows r
    where r.import_id = p_import and r.included
    order by r.position
  loop
    v_p := v_row.person;
    v_email := lower(trim(coalesce(v_p ->> 'work_email', '')));
    if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      raise exception 'row %: a work email is needed', v_row.position using errcode = 'check_violation';
    end if;
    -- Also catches the same person twice in this file (the first is in now).
    if exists (select 1 from public.requests r where r.work_email = v_email) then
      raise exception 'row %: % is already in the app', v_row.position, v_email using errcode = 'unique_violation';
    end if;
    if nullif(trim(coalesce(v_p ->> 'first_name', '')), '') is null
       or nullif(trim(coalesce(v_p ->> 'last_name', '')), '') is null then
      raise exception 'row %: first and last name are needed', v_row.position using errcode = 'check_violation';
    end if;
    v_start := nullif(v_p ->> 'start_date', '')::date;
    v_leave := nullif(v_p ->> 'leave_date', '')::date;
    if v_start is null then
      raise exception 'row %: a start date is needed', v_row.position using errcode = 'check_violation';
    end if;
    if v_start > v_today then
      raise exception 'row %: the start date is in the future — use a normal onboarding', v_row.position
        using errcode = 'check_violation';
    end if;
    if v_leave is not null and (v_leave < v_start or v_leave > v_today) then
      raise exception 'row %: the leave date must be between the start date and today', v_row.position
        using errcode = 'check_violation';
    end if;
    v_office := null;
    if v_p ? 'office_id' and v_p ->> 'office_id' is not null then
      select * into v_office from public.offices where id = (v_p ->> 'office_id')::smallint;
      if not found then
        raise exception 'row %: unknown office', v_row.position using errcode = 'check_violation';
      end if;
    end if;
    -- F24f: employee (the default) or contractor; only a contractor may have no office.
    v_kind := coalesce(nullif(lower(trim(coalesce(v_p ->> 'worker_type', ''))), ''), 'employee');
    if v_kind not in ('employee', 'contractor') then
      raise exception 'row %: employee or contractor', v_row.position using errcode = 'check_violation';
    end if;
    if v_kind = 'employee' and v_office.id is null then
      raise exception 'row %: an employee needs an office', v_row.position using errcode = 'check_violation';
    end if;
    -- Noon in the company's timezone: the day stays the same on every screen.
    v_start_at := (v_start + time '12:00') at time zone v_tz;

    insert into public.requests (
      type, state, created_by, assignee_id, ticket_year, import_id,
      first_name, last_name, work_email, job_title, department_id, country,
      office_id, region_id, office_city_id, nationalities, manager_name, worker_type,
      effective_date, state_changed_at, execution_started_at, closed_at)
    values (
      'onboarding', 'closed', v_admin, v_admin, extract(year from v_start)::smallint, p_import,
      trim(v_p ->> 'first_name'), trim(v_p ->> 'last_name'), v_email,
      nullif(trim(coalesce(v_p ->> 'job_title', '')), ''),
      (v_p ->> 'department_id')::smallint,
      coalesce(nullif(upper(trim(coalesce(v_p ->> 'country', ''))), ''), v_office.country),
      v_office.id, (v_p ->> 'region_id')::smallint, (v_p ->> 'office_city_id')::integer,
      case when jsonb_typeof(v_p -> 'nationalities') = 'array'
                and jsonb_array_length(v_p -> 'nationalities') > 0
           then array(select upper(x) from jsonb_array_elements_text(v_p -> 'nationalities') as x) end,
      nullif(trim(coalesce(v_p ->> 'manager_name', '')), ''), v_kind,
      v_start, v_start_at, v_start_at, v_start_at)
    returning id, employee_id, array[ticket_id] into v_on, v_employee, v_tickets;

    v_count := 0;
    for v_a in select * from jsonb_array_elements(coalesce(v_p -> 'access', '[]'::jsonb)) loop
      v_since := coalesce(nullif(v_a ->> 'since', '')::date, v_start);
      if v_since > coalesce(v_leave, v_today) then
        raise exception 'row %: access cannot start after % ', v_row.position, coalesce(v_leave, v_today)
          using errcode = 'check_violation';
      end if;
      if v_a ->> 'app_id' is not null then
        select * into v_app from public.catalog_apps where id = (v_a ->> 'app_id')::smallint;
        if not found then
          raise exception 'row %: unknown application', v_row.position using errcode = 'check_violation';
        end if;
        select c.name into v_category from public.catalog_categories c where c.id = v_app.category_id;
        insert into public.employee_access_inventory (
          employee_id, kind, app_id, name, category_name, permission, source,
          granted_request_id, granted_at)
        values (
          v_employee, 'application', v_app.id, v_app.name, v_category,
          private.clean_permission(v_app, nullif(trim(coalesce(v_a ->> 'permission', '')), '')),
          'import', v_on, (v_since + time '12:00') at time zone v_tz);
      else
        if nullif(trim(coalesce(v_a ->> 'name', '')), '') is null or length(trim(v_a ->> 'name')) > 80 then
          raise exception 'row %: an application needs a name (1–80 characters)', v_row.position
            using errcode = 'check_violation';
        end if;
        insert into public.employee_access_inventory (
          employee_id, kind, name, category_name, permission, source,
          granted_request_id, granted_at)
        values (
          v_employee, 'application', trim(v_a ->> 'name'), 'Other',
          nullif(left(trim(coalesce(v_a ->> 'permission', '')), 200), ''),
          'import', v_on, (v_since + time '12:00') at time zone v_tz);
      end if;
      v_count := v_count + 1;
    end loop;

    v_off := null;
    if v_leave is not null then
      v_leave_at := (v_leave + time '12:00') at time zone v_tz;
      insert into public.requests (
        type, state, created_by, assignee_id, ticket_year, import_id,
        first_name, last_name, work_email, job_title, department_id, country,
        office_id, region_id, office_city_id, nationalities, manager_name, worker_type,
        effective_date, last_working_day, state_changed_at, execution_started_at, closed_at)
      select
        'offboarding', 'closed', v_admin, v_admin, extract(year from v_leave)::smallint, p_import,
        r.first_name, r.last_name, r.work_email, r.job_title, r.department_id, r.country,
        r.office_id, r.region_id, r.office_city_id, r.nationalities, r.manager_name, r.worker_type,
        v_leave, v_leave, v_leave_at, v_leave_at, v_leave_at
      from public.requests r where r.id = v_on
      returning id into v_off;
      select v_tickets || ticket_id into v_tickets from public.requests where id = v_off;
      update public.employee_access_inventory
      set ended_at = v_leave_at, ended_request_id = v_off, end_reason = 'removed'
      where granted_request_id = v_on and ended_at is null;
      v_leavers := v_leavers + 1;
    end if;

    update public.staff_import_rows
    set onboarding_request_id = v_on, offboarding_request_id = v_off
    where id = v_row.id;

    perform private.write_audit('import.person', 'employee', v_employee::text,
      jsonb_build_object(
        'import_id', p_import, 'file_name', v_import.file_name, 'row', v_row.position,
        'tickets', to_jsonb(v_tickets), 'start_date', v_start, 'leave_date', v_leave,
        'access', v_count));
    v_people := v_people + 1;
    v_access := v_access + v_count;
  end loop;

  v_counts := jsonb_build_object(
    'people', v_people, 'leavers', v_leavers, 'access', v_access,
    'left_out', (select count(*) from public.staff_import_rows r
                 where r.import_id = p_import and not r.included));
  update public.staff_imports
  set status = 'imported', finished_at = now(), counts = v_counts
  where id = p_import;
  perform private.write_audit('import.completed', 'staff_import', p_import::text,
    jsonb_build_object('file_name', v_import.file_name, 'file_path', v_import.file_path) || v_counts);
  -- Off again: nothing later in this transaction is treated as an import.
  perform set_config('app.importing', 'off', true);
  return v_counts;
end;
$$;

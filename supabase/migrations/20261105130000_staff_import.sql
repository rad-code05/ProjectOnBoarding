-- F24a — Import of existing staff (database).
--
-- People who joined before this app come in once, from one reviewed file
-- (design/staff-import.md, decided 2026-11-01 / 2026-11-05). The ONLY place
-- the app accepts dates in the past:
--
--   staff_imports         one uploaded file: who, when, the file kept as
--                         evidence in the private `imports` bucket, open →
--                         imported / discarded. Admins only.
--   staff_import_rows     one person as the app checked them (`data` for the
--                         grid, `person` = the values the database writes,
--                         `problems`, Include) — up to 500.
--   import_staff()        Confirm: every included row, all or nothing. Each
--                         person becomes one closed **Imported record**
--                         (onboarding, ticket IMP-<start year>-NNNNNN, its own
--                         series) dated from the file; a leaver also gets a
--                         closed imported offboarding on the leave date. What
--                         they hold goes into the access inventory (source
--                         import, with its date), ended on the leave date for
--                         leavers. Checked again here: work email not in the
--                         app yet, no dates in the future, leave after start,
--                         applications and roles from the catalog.
--   discard_staff_import  an open import is dropped (kept, read-only).
--
-- Imported records are inserted straight as closed, behind the transaction
-- flag `app.importing` that only import_staff() sets. The email, inventory
-- and access-change triggers react to state *changes* only, so an import
-- sends no email and starts nothing. Imported records have no snapshot,
-- signature or PDF of their own; they are never shown as signed. Audit: one
-- import.person per person and one import.completed (server time) — the
-- usual request.created is left out for them.

-- ---------------------------------------------------------------------------
-- 1. Imports and their rows
-- ---------------------------------------------------------------------------
create table public.staff_imports (
  id uuid primary key default gen_random_uuid(),
  created_by text not null default private.current_user_id()
    references public.app_users (clerk_user_id),
  file_name text not null check (length(trim(file_name)) between 1 and 200),
  -- `<import id>/<file name>` in the private `imports` bucket (evidence).
  file_path text check (file_path is null or length(file_path) <= 300),
  status text not null default 'open' check (status in ('open', 'imported', 'discarded')),
  counts jsonb not null default '{}'::jsonb check (jsonb_typeof(counts) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);
create index staff_imports_created_idx on public.staff_imports (created_at desc);
comment on table public.staff_imports is
  'One import of existing staff (F24): the file (kept as evidence), who and when, open → imported / discarded. Admins only.';

create table public.staff_import_rows (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.staff_imports (id) on delete cascade,
  position smallint not null check (position between 1 and 500),
  included boolean not null default true,
  -- What the grid shows and edits (as read from the file).
  data jsonb not null default '{}'::jsonb
    check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 20000),
  -- What the database writes: names already resolved to ids by the app's
  -- checks (F24b) — see import_staff() for the keys.
  person jsonb not null default '{}'::jsonb
    check (jsonb_typeof(person) = 'object' and octet_length(person::text) <= 20000),
  problems jsonb not null default '[]'::jsonb
    check (jsonb_typeof(problems) = 'array' and jsonb_array_length(problems) <= 60),
  onboarding_request_id uuid references public.requests (id),
  offboarding_request_id uuid references public.requests (id),
  updated_at timestamptz not null default now(),
  unique (import_id, position)
);
comment on table public.staff_import_rows is
  'One person of a staff import (F24): grid values, the values written, the checks, Include; the imported records once done.';

alter table public.requests
  add column ticket_prefix text not null default 'UAM' check (ticket_prefix in ('UAM', 'IMP')),
  add column import_id uuid references public.staff_imports (id);
comment on column public.requests.ticket_prefix is 'UAM = made in the app; IMP = an Imported record (F24), its own numbering.';
comment on column public.requests.import_id is 'Set on Imported records (F24): the import they came from. Their dates come from the import file.';
alter table public.requests drop constraint requests_ticket_year_ticket_number_key;
alter table public.requests add constraint requests_ticket_number_key unique (ticket_prefix, ticket_year, ticket_number);
create index requests_import_idx on public.requests (import_id) where import_id is not null;

create table private.import_ticket_counters (
  year smallint primary key,
  last_number integer not null
);
revoke all on private.import_ticket_counters from public;

-- ---------------------------------------------------------------------------
-- 2. Requests: imported records only through import_staff()
-- ---------------------------------------------------------------------------
create or replace function private.request_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_year smallint;
  v_number integer;
begin
  if coalesce(current_setting('app.importing', true), '') = 'on' then
    -- Imported record: year of its own date, IMP series, dates as given.
    v_year := new.ticket_year;
    insert into private.import_ticket_counters as c (year, last_number) values (v_year, 1)
    on conflict (year) do update set last_number = c.last_number + 1
    returning last_number into v_number;
    new.ticket_prefix := 'IMP';
    new.ticket_number := v_number;
    new.ticket_id := format('IMP-%s-%s', v_year, lpad(v_number::text, 6, '0'));
  else
    v_year := extract(year from now() at time zone private.company_timezone());
    -- Atomic per-year counter: concurrent inserts can never get the same number.
    insert into private.ticket_counters as c (year, last_number) values (v_year, 1)
    on conflict (year) do update set last_number = c.last_number + 1
    returning last_number into v_number;
    new.ticket_prefix := 'UAM';
    new.import_id := null;
    new.ticket_year := v_year;
    new.ticket_number := v_number;
    new.ticket_id := format('UAM-%s-%s', v_year, lpad(v_number::text, 6, '0'));
    new.closed_at := null;
  end if;
  new.version := 1;
  new.created_at := now();
  new.updated_at := now();
  new.assignee_id := coalesce(new.assignee_id, new.created_by);
  new.form_version_id := coalesce(new.form_version_id,
    (select id from public.form_versions where is_current));
  return new;
end;
$$;

-- As in 20261013160000_mailbox_keeps_version.sql; ticket_prefix and
-- import_id joined the fields that never change.
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
     or new.ticket_prefix is distinct from old.ticket_prefix
     or new.import_id is distinct from old.import_id
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
  -- The offboarding mailbox choice (set_mailbox_handling) isn't a typed form
  -- field: it doesn't bump the version, so the form's next save isn't
  -- refused as "changed somewhere else" (found 2026-10-13).
  new.version := case
    when coalesce(current_setting('app.removal_work', true), '') = 'on' then old.version
    else old.version + 1
  end;
  return new;
end;
$$;

-- As in 20261012150000_offboarding_request.sql; an imported leaver's
-- offboarding is the one offboarding that starts closed.
create or replace function private.request_offboarding_rules()
returns trigger
language plpgsql
security definer
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
  elsif new.type = 'offboarding' and new.state <> 'draft'
        and coalesce(current_setting('app.importing', true), '') <> 'on' then
    raise exception 'an offboarding starts as a draft' using errcode = 'check_violation';
  end if;
  new.handover_to := nullif(trim(new.handover_to), '');
  new.sla_due_at := private.sla_deadline(new.sla_timeline, new.access_cutoff_at);
  return new;
end;
$$;

-- As in 20261008140000_workflow_execution.sql; an imported record's creation
-- is audited by import_staff() (import.person), not as request.created.
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
    if new.import_id is null then
      perform private.write_audit('request.created', 'request', new.id::text,
        jsonb_build_object('ticket_id', new.ticket_id, 'type', new.type));
    end if;
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
-- 3. Guards and times of the import tables
-- ---------------------------------------------------------------------------
create function private.set_staff_import_times()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and tg_table_name = 'staff_imports' then
    new.created_at := now();
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger staff_imports_times before insert or update on public.staff_imports
  for each row execute function private.set_staff_import_times();
create trigger staff_import_rows_times before insert or update on public.staff_import_rows
  for each row execute function private.set_staff_import_times();

create function private.guard_staff_imports()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_importing boolean := coalesce(current_setting('app.importing', true), '') = 'on';
begin
  if tg_op = 'INSERT' then
    if new.status <> 'open' or new.finished_at is not null or new.counts <> '{}'::jsonb then
      raise exception 'a new import starts open' using errcode = '42501';
    end if;
    return new;
  end if;
  if old.status <> 'open' then
    raise exception 'this import is finished' using errcode = '42501';
  end if;
  if (new.status, new.finished_at, new.counts) is distinct from (old.status, old.finished_at, old.counts)
     and not v_importing then
    raise exception 'an import is finished only by Confirm or Discard' using errcode = '42501';
  end if;
  if new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then
    raise exception 'the maker of an import never changes' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger staff_imports_guard before insert or update on public.staff_imports
  for each row execute function private.guard_staff_imports();

create function private.guard_staff_import_rows()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.staff_import_rows := case when tg_op = 'DELETE' then old else new end;
begin
  if coalesce(current_setting('app.importing', true), '') = 'on' then
    return v_row;
  end if;
  if exists (select 1 from public.staff_imports i
             where i.id = v_row.import_id and i.status <> 'open') then
    raise exception 'this import is finished' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.import_id is distinct from old.import_id then
    raise exception 'a row stays in its import' using errcode = '42501';
  end if;
  if tg_op <> 'DELETE' then
    new.onboarding_request_id := case when tg_op = 'UPDATE' then old.onboarding_request_id end;
    new.offboarding_request_id := case when tg_op = 'UPDATE' then old.offboarding_request_id end;
  end if;
  return v_row;
end;
$$;
create trigger staff_import_rows_guard before insert or update or delete on public.staff_import_rows
  for each row execute function private.guard_staff_import_rows();

-- ---------------------------------------------------------------------------
-- 4. Confirm: import_staff()
-- ---------------------------------------------------------------------------
-- `person` keys (strings unless said): first_name, last_name, work_email,
-- job_title, department_id (number), office_id (number), region_id (number),
-- office_city_id (number), country (ISO 2 letters; the office's when empty),
-- nationalities (array of ISO 2 letters), manager_name, start_date and
-- leave_date ('YYYY-MM-DD'; leave_date empty for people still here), access
-- (array of { app_id (number) | name (an application not in the catalog),
-- permission, since ('YYYY-MM-DD', default the start date) }).
create function public.import_staff(p_import uuid)
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
    -- Noon in the company's timezone: the day stays the same on every screen.
    v_start_at := (v_start + time '12:00') at time zone v_tz;

    insert into public.requests (
      type, state, created_by, assignee_id, ticket_year, import_id,
      first_name, last_name, work_email, job_title, department_id, country,
      office_id, region_id, office_city_id, nationalities, manager_name,
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
      nullif(trim(coalesce(v_p ->> 'manager_name', '')), ''),
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
        office_id, region_id, office_city_id, nationalities, manager_name,
        effective_date, last_working_day, state_changed_at, execution_started_at, closed_at)
      select
        'offboarding', 'closed', v_admin, v_admin, extract(year from v_leave)::smallint, p_import,
        r.first_name, r.last_name, r.work_email, r.job_title, r.department_id, r.country,
        r.office_id, r.region_id, r.office_city_id, r.nationalities, r.manager_name,
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
comment on function public.import_staff(uuid) is
  'F24 Confirm: imports every included row of an open staff import as Imported records with the file''s dates, all or nothing. Admin only, audited.';

create function public.discard_staff_import(p_import uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_import public.staff_imports;
begin
  perform private.require_admin();
  select * into v_import from public.staff_imports where id = p_import for update;
  if not found then
    raise exception 'unknown import' using errcode = 'no_data_found';
  end if;
  if v_import.status <> 'open' then
    raise exception 'this import is finished already' using errcode = 'check_violation';
  end if;
  perform set_config('app.importing', 'on', true);
  update public.staff_imports set status = 'discarded', finished_at = now() where id = p_import;
  perform private.write_audit('import.discarded', 'staff_import', p_import::text,
    jsonb_build_object('file_name', v_import.file_name));
  perform set_config('app.importing', 'off', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. The import file, kept as evidence (private bucket, admins only)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('imports', 'imports', false, 10485760, array[
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv', 'text/plain']);

create policy "imports: admins upload the file of an open import" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'imports'
  and (select private.has_any_role(array['admin']::public.app_role[]))
  and exists (select 1 from public.staff_imports i
              where i.id::text = (storage.foldername(name))[1] and i.status = 'open')
);
create policy "imports: admins read import files" on storage.objects
for select to authenticated
using (
  bucket_id = 'imports'
  and (select private.has_any_role(array['admin']::public.app_role[]))
);
-- No update / delete policies: the evidence is never replaced.

-- ---------------------------------------------------------------------------
-- 6. Row Level Security and grants
-- ---------------------------------------------------------------------------
alter table public.staff_imports enable row level security;
alter table public.staff_import_rows enable row level security;

create policy "staff_imports: admins read" on public.staff_imports
for select to authenticated
using ((select private.has_any_role(array['admin']::public.app_role[])));
create policy "staff_imports: admins start one" on public.staff_imports
for insert to authenticated
with check ((select private.has_any_role(array['admin']::public.app_role[]))
            and created_by = (select private.current_user_id()));
create policy "staff_imports: admins name the file" on public.staff_imports
for update to authenticated
using ((select private.has_any_role(array['admin']::public.app_role[])))
with check ((select private.has_any_role(array['admin']::public.app_role[])));

create policy "staff_import_rows: admins read" on public.staff_import_rows
for select to authenticated
using ((select private.has_any_role(array['admin']::public.app_role[])));
create policy "staff_import_rows: admins write open imports" on public.staff_import_rows
for all to authenticated
using ((select private.has_any_role(array['admin']::public.app_role[])))
with check ((select private.has_any_role(array['admin']::public.app_role[])));

revoke all on public.staff_imports, public.staff_import_rows from anon, authenticated, service_role;
grant select, insert, update (file_path) on public.staff_imports to authenticated;
grant select, insert, update, delete on public.staff_import_rows to authenticated;
grant select on public.staff_imports, public.staff_import_rows to service_role;

revoke all on function private.set_staff_import_times() from public;
revoke all on function private.guard_staff_imports() from public;
revoke all on function private.guard_staff_import_rows() from public;
revoke all on function public.import_staff(uuid) from public, anon;
revoke all on function public.discard_staff_import(uuid) from public, anon;
grant execute on function public.import_staff(uuid) to authenticated;
grant execute on function public.discard_staff_import(uuid) to authenticated;

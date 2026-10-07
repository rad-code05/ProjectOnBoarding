-- F01b — Requests (drafts), employees, departments and form v4.1 (sections 1–2).
--
-- Same rules as S6: RLS on every table, explicit grants only, helpers in
-- `private`, timestamps set by the database, every change audited.
--
--   * Ticket IDs come from the database: UAM-<year>-<6 digits>, the number
--     restarting each year (decision 2026-10-07). Year = company timezone.
--   * `version` goes up on every save: the app saves "where version = <the
--     one I loaded>", so a stale save changes nothing (no silent overwrite).
--   * Approvers never see drafts or work in progress.
--   * Request state changes arrive with the workflow (F04); until then they
--     are refused.

-- ---------------------------------------------------------------------------
-- 1. Types
-- ---------------------------------------------------------------------------
create type public.request_type as enum ('onboarding', 'offboarding', 'access_modification');
create type public.request_state as enum (
  'draft', 'in_execution', 'pending_confirmation', 'returned', 'closed', 'cancelled');
create type public.request_priority as enum ('low', 'medium', 'high');

-- ---------------------------------------------------------------------------
-- 2. Reference data: departments, form versions and fields
-- ---------------------------------------------------------------------------
create table public.departments (
  id smallint generated always as identity primary key,
  name text not null unique check (length(trim(name)) > 0),
  active boolean not null default true,
  sort_order smallint not null default 0
);
comment on table public.departments is 'Department list (data, not code). Retired with active = false, never deleted. Editing screen: F21.';

insert into public.departments (name, sort_order) values
  ('Engineering', 10), ('Tech', 20), ('Sales', 30), ('Operations', 40),
  ('Marketing', 50), ('Compliance', 60), ('Admin', 70);

create table public.form_versions (
  id smallint generated always as identity primary key,
  version text not null unique,
  published_at timestamptz not null default now(),
  is_current boolean not null default false
);
comment on table public.form_versions is 'Published, immutable versions of the request form. Each request keeps the version it was created under.';
create unique index form_versions_one_current on public.form_versions (is_current) where is_current;

create table public.form_fields (
  id integer generated always as identity primary key,
  form_version_id smallint not null references public.form_versions (id),
  key text not null check (key ~ '^[a-z][a-z0-9_]*$'),
  label text not null,
  section smallint not null check (section between 1 and 11),
  field_type text not null check (field_type in ('text', 'email', 'date', 'select', 'department', 'country', 'user', 'system')),
  -- 'column' = a real column on requests; 'custom' = requests.custom_fields.
  storage text not null default 'column' check (storage in ('column', 'custom')),
  required boolean not null default false,
  options jsonb,
  help_text text,
  applies_to public.request_type[] not null default array['onboarding', 'offboarding', 'access_modification']::public.request_type[],
  sort_order smallint not null,
  unique (form_version_id, key)
);
comment on table public.form_fields is 'Field definitions per form version; the form is drawn from these (F01d).';

-- Form v4.1 = form v4 + Country (agreed 2026-09-30). Sections 1–2 now; the
-- features that build later sections add their fields.
insert into public.form_versions (version, is_current) values ('4.1', true);

insert into public.form_fields
  (form_version_id, key, label, section, field_type, required, options, help_text, sort_order)
select v.id, f.key, f.label, f.section, f.field_type, f.required, f.options::jsonb, f.help_text, f.sort_order
from public.form_versions v
cross join (values
  ('type',             'Ticket type',          1, 'select',     true,  '["onboarding","offboarding","access_modification"]', null, 10),
  ('ticket_id',        'Ticket ID',            1, 'system',     false, null, 'Created automatically.', 20),
  ('status',           'Status',               1, 'system',     false, null, 'Follows the workflow.', 30),
  ('priority',         'Priority',             1, 'select',     true,  '["low","medium","high"]', null, 40),
  ('assignee',         'Assignee (IT owner)',  1, 'user',       true,  null, null, 50),
  ('opened_at',        'Opened',               1, 'system',     false, null, null, 60),
  ('closed_at',        'Closed',               1, 'system',     false, null, null, 70),
  ('first_name',       'First name',           2, 'text',       true,  null, null, 10),
  ('last_name',        'Last name',            2, 'text',       true,  null, null, 20),
  ('work_email',       'Work email',           2, 'email',      true,  null, 'Identifies the person across requests.', 30),
  ('job_title',        'Job title / role',     2, 'text',       true,  null, null, 40),
  ('department',       'Department / team',    2, 'department', true,  null, null, 50),
  ('country',          'Country',              2, 'country',    true,  null, null, 60),
  ('manager_name',     'Manager',              2, 'text',       true,  null, null, 70),
  ('requestor_name',   'Requested by',         2, 'text',       true,  null, null, 80),
  ('employment_event', 'Employment event',     2, 'system',     false, null, 'Follows the ticket type.', 90),
  ('effective_date',   'Effective date',       2, 'date',       true,  null, null, 100)
) as f (key, label, section, field_type, required, options, help_text, sort_order)
where v.version = '4.1';

-- Published versions and their fields never change (a new version is published instead).
create trigger form_versions_no_change before update or delete on public.form_versions
for each row execute function private.forbid_change();
create trigger form_fields_no_change before update or delete on public.form_fields
for each row execute function private.forbid_change();

-- ---------------------------------------------------------------------------
-- 3. Employees and requests
-- ---------------------------------------------------------------------------
create table public.employees (
  id uuid primary key default gen_random_uuid(),
  work_email text not null unique check (work_email = lower(work_email) and work_email like '%_@_%'),
  first_name text,
  last_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.employees is 'People requests are about, keyed by work email. Created/linked automatically from requests.';

create table public.requests (
  id uuid primary key default gen_random_uuid(),
  ticket_id text not null unique,
  ticket_year smallint not null,
  ticket_number integer not null,
  type public.request_type not null default 'onboarding',
  state public.request_state not null default 'draft',
  priority public.request_priority not null default 'medium',
  assignee_id text references public.app_users (clerk_user_id),
  created_by text not null references public.app_users (clerk_user_id),
  employee_id uuid references public.employees (id),
  -- Section 2 (empty while drafting; completeness is checked when signing, F06).
  first_name text,
  last_name text,
  work_email text check (work_email = lower(work_email) and work_email like '%_@_%'),
  job_title text,
  department_id smallint references public.departments (id),
  country text check (country ~ '^[A-Z]{2}$'),
  manager_name text,
  requestor_name text,
  effective_date date,
  form_version_id smallint not null references public.form_versions (id),
  custom_fields jsonb not null default '{}'::jsonb check (jsonb_typeof(custom_fields) = 'object'),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  unique (ticket_year, ticket_number)
);
comment on table public.requests is 'Access requests. Never deleted. State changes go through the workflow (F04).';
comment on column public.requests.version is 'Optimistic locking: +1 on every save; saves must name the version they loaded.';
create index requests_state_idx on public.requests (state);
create index requests_updated_at_idx on public.requests (updated_at desc);

-- ---------------------------------------------------------------------------
-- 4. Ticket numbers, guards, employee link
-- ---------------------------------------------------------------------------

-- Company timezone for ticket years (D3 still open — assumed Europe/Zurich).
create function private.company_timezone()
returns text
language sql
immutable
set search_path = ''
as $$ select 'Europe/Zurich' $$;

create table private.ticket_counters (
  year smallint primary key,
  last_number integer not null
);

create function private.request_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_year smallint := extract(year from now() at time zone private.company_timezone());
  v_number integer;
begin
  -- Atomic per-year counter: concurrent inserts can never get the same number.
  insert into private.ticket_counters as c (year, last_number) values (v_year, 1)
  on conflict (year) do update set last_number = c.last_number + 1
  returning last_number into v_number;

  new.ticket_year := v_year;
  new.ticket_number := v_number;
  new.ticket_id := format('UAM-%s-%s', v_year, lpad(v_number::text, 6, '0'));
  new.version := 1;
  new.created_at := now();
  new.updated_at := now();
  new.closed_at := null;
  new.assignee_id := coalesce(new.assignee_id, new.created_by);
  new.form_version_id := coalesce(new.form_version_id,
    (select id from public.form_versions where is_current));
  return new;
end;
$$;

create function private.request_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.ticket_id is distinct from old.ticket_id
     or new.ticket_year is distinct from old.ticket_year
     or new.ticket_number is distinct from old.ticket_number
     or new.created_by is distinct from old.created_by
     or new.form_version_id is distinct from old.form_version_id then
    raise exception 'ticket ID, creator and form version cannot be changed'
      using errcode = 'insufficient_privilege';
  end if;
  if new.state is distinct from old.state then
    raise exception 'request state changes go through the workflow (F04)'
      using errcode = 'insufficient_privilege';
  end if;
  new.created_at := old.created_at;
  new.closed_at := old.closed_at;
  new.updated_at := now();
  new.version := old.version + 1;
  return new;
end;
$$;

-- Links the request to its employee (by work email), creating the employee once.
create function private.request_link_employee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.work_email is null then
    new.employee_id := null;
    return new;
  end if;
  insert into public.employees (work_email, first_name, last_name)
  values (new.work_email, new.first_name, new.last_name)
  on conflict (work_email) do nothing;
  select id into new.employee_id from public.employees where work_email = new.work_email;
  return new;
end;
$$;

create trigger requests_a_before_insert before insert on public.requests
for each row execute function private.request_before_insert();
create trigger requests_a_before_update before update on public.requests
for each row execute function private.request_before_update();
create trigger requests_b_link_employee before insert or update of work_email, first_name, last_name
on public.requests for each row execute function private.request_link_employee();

create function private.set_employee_timestamps()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then new.created_at := now(); else new.created_at := old.created_at; end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger employees_timestamps before insert or update on public.employees
for each row execute function private.set_employee_timestamps();

-- ---------------------------------------------------------------------------
-- 5. Audit: every create and change, with before → after per field
-- ---------------------------------------------------------------------------
create function private.audit_requests()
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
    and n.key not in ('version', 'updated_at', 'employee_id');

  if v_changes is not null then
    perform private.write_audit('request.updated', 'request', new.id::text,
      jsonb_build_object('ticket_id', new.ticket_id, 'changes', v_changes));
  end if;
  return null;
end;
$$;
create trigger requests_audit after insert or update on public.requests
for each row execute function private.audit_requests();

create function private.audit_employees()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.write_audit('employee.created', 'employee', new.id::text,
    jsonb_build_object('work_email', new.work_email));
  return null;
end;
$$;
create trigger employees_audit after insert on public.employees
for each row execute function private.audit_employees();

-- ---------------------------------------------------------------------------
-- 6. Row Level Security
-- ---------------------------------------------------------------------------
alter table public.departments enable row level security;
alter table public.form_versions enable row level security;
alter table public.form_fields enable row level security;
alter table public.employees enable row level security;
alter table public.requests enable row level security;

create policy "departments: active users read" on public.departments
for select to authenticated using ((select private.is_active_user()));
create policy "form_versions: active users read" on public.form_versions
for select to authenticated using ((select private.is_active_user()));
create policy "form_fields: active users read" on public.form_fields
for select to authenticated using ((select private.is_active_user()));

-- Employees: anyone who works with requests (approvers see names on what they confirm).
create policy "employees: read with any role" on public.employees
for select to authenticated
using ((select private.has_any_role(array['admin', 'requester', 'it_operator', 'approver', 'auditor']::public.app_role[])));

-- Requests: IT side and auditors see all; approvers only what is theirs to
-- confirm or already decided — never drafts or work in progress.
create policy "requests: IT side and auditors read all" on public.requests
for select to authenticated
using ((select private.has_any_role(array['admin', 'requester', 'it_operator', 'auditor']::public.app_role[])));

create policy "requests: approvers read awaiting, returned and closed" on public.requests
for select to authenticated
using (
  (select private.has_any_role(array['approver']::public.app_role[]))
  and state in ('pending_confirmation', 'returned', 'closed')
);

create policy "requests: requesters create drafts in their own name" on public.requests
for insert to authenticated
with check (
  (select private.has_any_role(array['admin', 'requester']::public.app_role[]))
  and created_by = (select private.current_user_id())
  and state = 'draft'
);

create policy "requests: IT side edits open requests" on public.requests
for update to authenticated
using (
  (select private.has_any_role(array['admin', 'requester', 'it_operator']::public.app_role[]))
  and state in ('draft', 'in_execution', 'returned')
)
with check (
  (select private.has_any_role(array['admin', 'requester', 'it_operator']::public.app_role[]))
);

-- ---------------------------------------------------------------------------
-- 7. Grants (nothing is ever deleted)
-- ---------------------------------------------------------------------------
revoke all on public.departments, public.form_versions, public.form_fields,
  public.employees, public.requests from anon, authenticated, service_role;
revoke all on private.ticket_counters from public;

grant select on public.departments, public.form_versions, public.form_fields,
  public.employees to authenticated;
grant select, insert, update on public.requests to authenticated;

grant select on public.departments, public.form_versions, public.form_fields,
  public.employees, public.requests to service_role;

grant usage on type public.request_type, public.request_state, public.request_priority
  to authenticated, service_role;

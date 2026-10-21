-- F27a — Offices & nationality (the database part).
--
--   * offices: where people work — an admin-managed list (Dubai, Abu Dhabi,
--     Geneva, US to start), retired instead of deleted; only through
--     admin_save_office() / admin_set_office_active(), audited office.*.
--   * country_regions: a fixed reference list of regions per country — the
--     50 US states + DC. An office with uses_regions asks for a state.
--   * office_cities: the cities of an office, per region (e.g. US · Texas ·
--     Austin) — admin-managed like offices (office.city_*).
--   * requests: office_id, region_id, office_city_id (State then City, both
--     optional, only for an office that uses regions) and nationalities (up to
--     two country codes, optional). Rules in private.request_office_rules().
--   * Form v4.2 = v4.1 + Office (required), State, City, Nationality — added
--     here but NOT current yet: F27c switches it on together with the screens.
--   * Snapshot: office / state / city / nationalities only when filled, so a
--     request signed before this migration keeps exactly the same snapshot
--     (its approver can still confirm it).
--   * Offboarding and access change copy office, state, city and
--     nationalities from the person's last closed request (never a retired
--     office or city).

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------
create table public.offices (
  id smallint generated always as identity primary key,
  name text not null check (length(trim(name)) between 1 and 80),
  city text check (length(trim(city)) between 1 and 80),
  country text not null check (country ~ '^[A-Z]{2}$'),
  uses_regions boolean not null default false,
  active boolean not null default true,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now()
);
create unique index offices_name_unique on public.offices (lower(name));
comment on table public.offices is 'Where people work (data, not code). Admin-managed through admin_save_office(); retired with active = false, never deleted.';
comment on column public.offices.uses_regions is 'Ask for a region (US: state) and a city on requests for this office.';

create table public.country_regions (
  id smallint generated always as identity primary key,
  country text not null check (country ~ '^[A-Z]{2}$'),
  code text not null check (code ~ '^[A-Z]{2,3}$'),
  name text not null,
  unique (country, code)
);
comment on table public.country_regions is 'Fixed reference list of regions per country (US: the 50 states + DC). Read-only.';

create table public.office_cities (
  id integer generated always as identity primary key,
  office_id smallint not null references public.offices (id),
  region_id smallint not null references public.country_regions (id),
  name text not null check (length(trim(name)) between 1 and 80),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index office_cities_name_unique on public.office_cities (office_id, region_id, lower(name));
comment on table public.office_cities is 'Cities of an office per region (US · Texas · Austin). Admin-managed through admin_save_office_city(); retired, never deleted.';

alter table public.requests
  add column office_id smallint references public.offices (id),
  add column region_id smallint references public.country_regions (id),
  add column office_city_id integer references public.office_cities (id),
  add column nationalities text[] check (
    nationalities is null or (
      cardinality(nationalities) between 1 and 2
      and array_to_string(nationalities, ',') ~ '^[A-Z]{2}(,[A-Z]{2})?$'
      and nationalities[1] is distinct from nationalities[2])),
  add check (office_city_id is null or region_id is not null),
  add check (region_id is null or office_id is not null);
comment on column public.requests.office_id is 'Office the person works at (F27); required from form v4.2 on.';
comment on column public.requests.nationalities is 'Up to two nationalities (ISO country codes); optional; not printed on the PDF record.';
create index requests_office_idx on public.requests (office_id) where office_id is not null;

-- ---------------------------------------------------------------------------
-- 2. Seeds: the four offices and the US states
-- ---------------------------------------------------------------------------
insert into public.offices (name, city, country, uses_regions, sort_order) values
  ('Dubai', 'Dubai', 'AE', false, 10),
  ('Abu Dhabi', 'Abu Dhabi', 'AE', false, 20),
  ('Geneva', 'Geneva', 'CH', false, 30),
  ('US', null, 'US', true, 40);

insert into public.country_regions (country, code, name)
select 'US', s.code, s.name
from (values
  ('AL', 'Alabama'), ('AK', 'Alaska'), ('AZ', 'Arizona'), ('AR', 'Arkansas'), ('CA', 'California'),
  ('CO', 'Colorado'), ('CT', 'Connecticut'), ('DE', 'Delaware'), ('DC', 'District of Columbia'),
  ('FL', 'Florida'), ('GA', 'Georgia'), ('HI', 'Hawaii'), ('ID', 'Idaho'), ('IL', 'Illinois'),
  ('IN', 'Indiana'), ('IA', 'Iowa'), ('KS', 'Kansas'), ('KY', 'Kentucky'), ('LA', 'Louisiana'),
  ('ME', 'Maine'), ('MD', 'Maryland'), ('MA', 'Massachusetts'), ('MI', 'Michigan'), ('MN', 'Minnesota'),
  ('MS', 'Mississippi'), ('MO', 'Missouri'), ('MT', 'Montana'), ('NE', 'Nebraska'), ('NV', 'Nevada'),
  ('NH', 'New Hampshire'), ('NJ', 'New Jersey'), ('NM', 'New Mexico'), ('NY', 'New York'),
  ('NC', 'North Carolina'), ('ND', 'North Dakota'), ('OH', 'Ohio'), ('OK', 'Oklahoma'), ('OR', 'Oregon'),
  ('PA', 'Pennsylvania'), ('RI', 'Rhode Island'), ('SC', 'South Carolina'), ('SD', 'South Dakota'),
  ('TN', 'Tennessee'), ('TX', 'Texas'), ('UT', 'Utah'), ('VT', 'Vermont'), ('VA', 'Virginia'),
  ('WA', 'Washington'), ('WV', 'West Virginia'), ('WI', 'Wisconsin'), ('WY', 'Wyoming')
) as s (code, name)
order by s.name;

-- ---------------------------------------------------------------------------
-- 3. Rules on a request's office, state and city
-- ---------------------------------------------------------------------------
create function private.request_office_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_office public.offices;
  v_region public.country_regions;
  v_city public.office_cities;
  v_new boolean := tg_op = 'INSERT';
begin
  if new.office_id is not null then
    select * into v_office from public.offices where id = new.office_id;
    if not v_office.active and (v_new or new.office_id is distinct from old.office_id) then
      raise exception 'the % office is retired', v_office.name using errcode = 'check_violation';
    end if;
  end if;
  if new.region_id is not null then
    select * into v_region from public.country_regions where id = new.region_id;
    if not v_office.uses_regions or v_region.country <> v_office.country then
      raise exception 'a state / region is only chosen for an office that uses them'
        using errcode = 'check_violation';
    end if;
  end if;
  if new.office_city_id is not null then
    select * into v_city from public.office_cities where id = new.office_city_id;
    if v_city.office_id <> new.office_id or v_city.region_id <> new.region_id then
      raise exception 'the city does not belong to this office and state' using errcode = 'check_violation';
    end if;
    if not v_city.active and (v_new or new.office_city_id is distinct from old.office_city_id) then
      raise exception 'the city % is retired', v_city.name using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

create trigger requests_office_rules
before insert or update of office_id, region_id, office_city_id on public.requests
for each row execute function private.request_office_rules();

-- ---------------------------------------------------------------------------
-- 4. Admin functions (audited office.*)
-- ---------------------------------------------------------------------------
create function public.admin_save_office(
  p_id smallint,
  p_name text,
  p_city text,
  p_country text,
  p_uses_regions boolean
)
returns smallint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_city text := nullif(regexp_replace(trim(coalesce(p_city, '')), '\s+', ' ', 'g'), '');
  v_country text := upper(trim(coalesce(p_country, '')));
  v_uses boolean := coalesce(p_uses_regions, false);
  v_before public.offices;
  v_id smallint;
begin
  perform private.require_admin();
  v_name := private.clean_name(p_name, 'an office');
  if v_city is not null and length(v_city) > 80 then
    raise exception 'a city has 1–80 characters' using errcode = 'check_violation';
  end if;
  if v_country !~ '^[A-Z]{2}$' then
    raise exception 'an office needs a country' using errcode = 'check_violation';
  end if;
  if v_uses and not exists (select 1 from public.country_regions where country = v_country) then
    raise exception 'states / regions are not available for this country yet' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.offices where lower(name) = lower(v_name) and id is distinct from p_id) then
    raise exception 'an office called % already exists', v_name using errcode = 'unique_violation';
  end if;

  if p_id is null then
    insert into public.offices (name, city, country, uses_regions, sort_order)
    values (v_name, v_city, v_country, v_uses,
            (select coalesce(max(sort_order), 0) + 10 from public.offices))
    returning id into v_id;
    perform private.write_audit('office.added', 'office', v_id::text,
      jsonb_build_object('after', jsonb_build_object(
        'name', v_name, 'city', v_city, 'country', v_country, 'uses_regions', v_uses)));
  else
    select * into v_before from public.offices where id = p_id for update;
    if not found then
      raise exception 'unknown office' using errcode = 'no_data_found';
    end if;
    if v_before.country <> v_country
       and exists (select 1 from public.office_cities where office_id = p_id) then
      raise exception 'an office with cities keeps its country' using errcode = 'check_violation';
    end if;
    update public.offices
    set name = v_name, city = v_city, country = v_country, uses_regions = v_uses
    where id = p_id;
    v_id := p_id;
    if (v_before.name, v_before.city, v_before.country, v_before.uses_regions)
       is distinct from (v_name, v_city, v_country, v_uses) then
      perform private.write_audit('office.changed', 'office', v_id::text,
        jsonb_build_object(
          'before', jsonb_build_object('name', v_before.name, 'city', v_before.city,
                                       'country', v_before.country, 'uses_regions', v_before.uses_regions),
          'after', jsonb_build_object('name', v_name, 'city', v_city,
                                      'country', v_country, 'uses_regions', v_uses)));
    end if;
  end if;
  return v_id;
end;
$$;
comment on function public.admin_save_office(smallint, text, text, text, boolean)
  is 'Admin: add (p_id null) or change an office; names unique ignoring case; audited office.added / office.changed.';

create function public.admin_set_office_active(p_id smallint, p_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before public.offices;
begin
  perform private.require_admin();
  select * into v_before from public.offices where id = p_id for update;
  if not found then
    raise exception 'unknown office' using errcode = 'no_data_found';
  end if;
  if v_before.active = p_active then
    return;
  end if;
  update public.offices set active = p_active where id = p_id;
  perform private.write_audit(
    case when p_active then 'office.restored' else 'office.retired' end,
    'office', p_id::text, jsonb_build_object('name', v_before.name));
end;
$$;
comment on function public.admin_set_office_active(smallint, boolean)
  is 'Admin: retire (false) or restore (true) an office; past requests keep it; audited.';

create function public.admin_save_office_city(
  p_id integer,
  p_office_id smallint,
  p_region_id smallint,
  p_name text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_office public.offices;
  v_region public.country_regions;
  v_before public.office_cities;
  v_id integer;
begin
  perform private.require_admin();
  v_name := private.clean_name(p_name, 'a city');
  select * into v_office from public.offices where id = p_office_id;
  if not found then
    raise exception 'unknown office' using errcode = 'no_data_found';
  end if;
  select * into v_region from public.country_regions where id = p_region_id;
  if not found or not v_office.uses_regions or v_region.country <> v_office.country then
    raise exception 'choose a state / region of this office' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.office_cities
             where office_id = p_office_id and region_id = p_region_id
               and lower(name) = lower(v_name) and id is distinct from p_id) then
    raise exception '% is already a city in %', v_name, v_region.name using errcode = 'unique_violation';
  end if;

  if p_id is null then
    insert into public.office_cities (office_id, region_id, name)
    values (p_office_id, p_region_id, v_name)
    returning id into v_id;
    perform private.write_audit('office.city_added', 'office', p_office_id::text,
      jsonb_build_object('city_id', v_id, 'after', jsonb_build_object(
        'office', v_office.name, 'region', v_region.name, 'name', v_name)));
  else
    select * into v_before from public.office_cities where id = p_id for update;
    if not found then
      raise exception 'unknown city' using errcode = 'no_data_found';
    end if;
    if v_before.office_id <> p_office_id or v_before.region_id <> p_region_id then
      raise exception 'a city stays in its office and state — add a new one instead'
        using errcode = 'check_violation';
    end if;
    update public.office_cities set name = v_name where id = p_id;
    v_id := p_id;
    if v_before.name <> v_name then
      perform private.write_audit('office.city_changed', 'office', p_office_id::text,
        jsonb_build_object('city_id', v_id,
          'before', jsonb_build_object('name', v_before.name),
          'after', jsonb_build_object('name', v_name)));
    end if;
  end if;
  return v_id;
end;
$$;
comment on function public.admin_save_office_city(integer, smallint, smallint, text)
  is 'Admin: add (p_id null) or rename a city of an office in a state / region; unique per office and state ignoring case; audited.';

create function public.admin_set_office_city_active(p_id integer, p_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before public.office_cities;
begin
  perform private.require_admin();
  select * into v_before from public.office_cities where id = p_id for update;
  if not found then
    raise exception 'unknown city' using errcode = 'no_data_found';
  end if;
  if v_before.active = p_active then
    return;
  end if;
  update public.office_cities set active = p_active where id = p_id;
  perform private.write_audit(
    case when p_active then 'office.city_restored' else 'office.city_retired' end,
    'office', v_before.office_id::text, jsonb_build_object('city_id', p_id, 'name', v_before.name));
end;
$$;
comment on function public.admin_set_office_city_active(integer, boolean)
  is 'Admin: retire (false) or restore (true) a city; past requests keep it; audited.';

-- ---------------------------------------------------------------------------
-- 5. Form v4.2 (not current yet — F27c publishes it with the screens)
-- ---------------------------------------------------------------------------
alter table public.form_fields drop constraint form_fields_field_type_check;
alter table public.form_fields add constraint form_fields_field_type_check check (field_type in (
  'text', 'email', 'date', 'select', 'department', 'country', 'user', 'system',
  'office', 'region', 'office_city', 'nationality'));

insert into public.form_versions (version, is_current) values ('4.2', false);

insert into public.form_fields
  (form_version_id, key, label, section, field_type, storage, required, options, help_text,
   applies_to, sort_order)
select v.id, f.key, f.label, f.section, f.field_type, f.storage, f.required, f.options, f.help_text,
  f.applies_to, f.sort_order
from public.form_fields f
join public.form_versions old on old.id = f.form_version_id and old.version = '4.1'
cross join public.form_versions v
where v.version = '4.2';

insert into public.form_fields
  (form_version_id, key, label, section, field_type, required, help_text, sort_order)
select v.id, f.key, f.label, 2, f.field_type, f.required, f.help_text, f.sort_order
from public.form_versions v
cross join (values
  ('office',        'Office',                  'office',      true,  'Where they work. Fills the country (still editable).', 54),
  ('region',        'State',                   'region',      false, 'Only for an office with states (the US).', 56),
  ('office_city',   'City',                    'office_city', false, 'Cities added for that state in Admin → Offices.', 57),
  ('nationalities', 'Nationality',             'nationality', false, 'Up to two. Not printed on the PDF record.', 65)
) as f (key, label, field_type, required, help_text, sort_order)
where v.version = '4.2';

-- Required fields: as in 20261014140000_access_modification_record.sql
-- (offboarding + access-change lines), plus the new keys mapped to columns.
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
-- 6. Snapshot: office, state, city, nationalities — only when filled
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
               'office', po.name, 'region', prg.name, 'office_city', poc.name,
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
-- 7. Offboarding / access change: section 2 from the last closed request,
--    now with office, state, city and nationalities (never a retired one)
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
     manager_name, requestor_name, office_id, region_id, office_city_id, nationalities)
  values
    (v_user, 'offboarding', coalesce(v_last.first_name, v_employee.first_name),
     coalesce(v_last.last_name, v_employee.last_name), v_employee.work_email, v_last.job_title,
     v_last.department_id, v_last.country, v_last.manager_name, v_last.requestor_name,
     v_place.office_id, v_place.region_id, v_place.office_city_id, v_last.nationalities)
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
     manager_name, requestor_name, office_id, region_id, office_city_id, nationalities)
  values
    (v_user, 'access_modification', coalesce(v_last.first_name, v_employee.first_name),
     coalesce(v_last.last_name, v_employee.last_name), v_employee.work_email, v_last.job_title,
     v_last.department_id, v_last.country, v_last.manager_name, v_last.requestor_name,
     v_place.office_id, v_place.region_id, v_place.office_city_id, v_last.nationalities)
  returning id into v_id;

  perform private.write_audit('request.access_change_started', 'request', v_id::text,
    jsonb_build_object('employee_id', p_employee_id,
      'held', (select count(*) from public.employee_access_inventory
               where employee_id = p_employee_id and ended_at is null)));
  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- The office / state / city to copy: only while still active (a retired
-- office is left empty for Raju to choose; a retired city keeps the state).
create function private.active_place(p_office_id smallint, p_region_id smallint, p_city_id integer)
returns table (office_id smallint, region_id smallint, office_city_id integer)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id,
    case when o.id is not null then p_region_id end,
    case when o.id is not null then c.id end
  from (select 1) one
  left join public.offices o on o.id = p_office_id and o.active
  left join public.office_cities c on c.id = p_city_id and c.active;
$$;

-- ---------------------------------------------------------------------------
-- 8. Row Level Security and grants (read for active users; writes only
--    through the admin functions)
-- ---------------------------------------------------------------------------
alter table public.offices enable row level security;
alter table public.country_regions enable row level security;
alter table public.office_cities enable row level security;

create policy "offices: active users read" on public.offices
for select to authenticated using ((select private.is_active_user()));
create policy "country_regions: active users read" on public.country_regions
for select to authenticated using ((select private.is_active_user()));
create policy "office_cities: active users read" on public.office_cities
for select to authenticated using ((select private.is_active_user()));

revoke all on public.offices, public.country_regions, public.office_cities
  from anon, authenticated, service_role;
grant select on public.offices, public.country_regions, public.office_cities
  to authenticated, service_role;

revoke all on function private.request_office_rules() from public;
revoke all on function private.active_place(smallint, smallint, integer) from public;
revoke all on function public.admin_save_office(smallint, text, text, text, boolean) from public, anon;
revoke all on function public.admin_set_office_active(smallint, boolean) from public, anon;
revoke all on function public.admin_save_office_city(integer, smallint, smallint, text) from public, anon;
revoke all on function public.admin_set_office_city_active(integer, boolean) from public, anon;
grant execute on function public.admin_save_office(smallint, text, text, text, boolean) to authenticated;
grant execute on function public.admin_set_office_active(smallint, boolean) to authenticated;
grant execute on function public.admin_save_office_city(integer, smallint, smallint, text) to authenticated;
grant execute on function public.admin_set_office_city_active(integer, boolean) to authenticated;

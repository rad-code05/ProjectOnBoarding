-- F27d-1 — Report filters by office, US state, city and nationality.
--
-- Every report (except Open requests by status, which is "right now" and
-- filters by type only) gets four more filters:
--   p_office      office id; 0 = "Not set" (requests from before form v4.2)
--   p_region      US state id
--   p_city        city id
--   p_nationality ISO code; 'none' = "Not set"; someone with two
--                 nationalities matches either.
-- One rule for all of them: private.request_place_matches(). The All users
-- list also returns office, location (state · city) and nationalities;
-- report_onboarded_by() can group by office ("Onboarded by office").
-- Access by application filters on the person's latest closed request (as it
-- does for department and country) and the holders list names the office.
--
-- Postgres cannot add parameters to an existing function, so each one is
-- dropped and created again with the same body plus the new filters; grants
-- are given again at the end.

-- ---------------------------------------------------------------------------
-- 1. The rule
-- ---------------------------------------------------------------------------
create function private.request_place_matches(
  p_office_id smallint,
  p_region_id smallint,
  p_city_id integer,
  p_nationalities text[],
  p_office smallint,
  p_region smallint,
  p_city integer,
  p_nationality text
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select (p_office is null
          or (p_office = 0 and p_office_id is null)
          or p_office_id = p_office)
     and (p_region is null or p_region_id = p_region)
     and (p_city is null or p_city_id = p_city)
     and (p_nationality is null
          or (p_nationality = 'none' and coalesce(cardinality(p_nationalities), 0) = 0)
          or p_nationality = any (coalesce(p_nationalities, '{}')));
$$;
comment on function private.request_place_matches(smallint, smallint, integer, text[], smallint, smallint, integer, text)
  is 'Report filters (F27d): office (0 = not set), state, city, nationality (none = not set; either of two matches).';
grant execute on function private.request_place_matches(smallint, smallint, integer, text[], smallint, smallint, integer, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. All users list (+ office, location, nationalities)
-- ---------------------------------------------------------------------------
drop function public.report_all_users(timestamptz, timestamptz, public.request_type, text, smallint, text, integer, integer);
create function public.report_all_users(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_type public.request_type default null,
  p_country text default null,
  p_department smallint default null,
  p_search text default null,
  p_limit integer default 20,
  p_offset integer default 0,
  p_office smallint default null,
  p_region smallint default null,
  p_city integer default null,
  p_nationality text default null
)
returns table (
  id uuid,
  ticket_id text,
  type public.request_type,
  state public.request_state,
  first_name text,
  last_name text,
  work_email text,
  department text,
  country text,
  effective_date date,
  last_working_day date,
  created_at timestamptz,
  closed_at timestamptz,
  office text,
  location text,
  nationalities text[],
  total_count bigint,
  people_count bigint
)
language plpgsql
stable
set search_path = ''
as $$
begin
  perform private.require_report_reader();
  return query
  with f as (
    select r.id, r.ticket_id, r.type, r.state, r.first_name, r.last_name, r.work_email,
           d.name as department, r.country, r.effective_date, r.last_working_day,
           r.created_at, r.closed_at,
           o.name as office,
           nullif(concat_ws(' · ', rg.name, oc.name), '') as location,
           r.nationalities
    from public.requests r
    left join public.departments d on d.id = r.department_id
    left join public.offices o on o.id = r.office_id
    left join public.country_regions rg on rg.id = r.region_id
    left join public.office_cities oc on oc.id = r.office_city_id
    where r.state <> 'cancelled'
      and (p_from is null or r.created_at >= p_from)
      and (p_to is null or r.created_at < p_to)
      and (p_type is null or r.type = p_type)
      and (p_country is null or r.country = p_country)
      and (p_department is null or r.department_id = p_department)
      and private.request_place_matches(r.office_id, r.region_id, r.office_city_id, r.nationalities,
                                        p_office, p_region, p_city, p_nationality)
      and (nullif(trim(p_search), '') is null
           or concat_ws(' ', r.first_name, r.last_name, r.work_email, r.ticket_id)
              ilike '%' || trim(p_search) || '%')
  )
  select f.*,
    (select count(*) from f),
    (select count(distinct coalesce(lower(f2.work_email), f2.id::text)) from f f2)
  from f
  order by f.created_at desc, f.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 10000)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;
comment on function public.report_all_users(timestamptz, timestamptz, public.request_type, text, smallint, text, integer, integer, smallint, smallint, integer, text)
  is 'Report "All users list": requests created in the period (not cancelled), newest first, with office / location / nationalities; RLS decides visibility.';

-- ---------------------------------------------------------------------------
-- 3. Onboarded by month
-- ---------------------------------------------------------------------------
drop function public.report_onboarded_by_month(date, date, text, smallint);
create function public.report_onboarded_by_month(
  p_from_month date,
  p_to_month date,
  p_country text default null,
  p_department smallint default null,
  p_office smallint default null,
  p_region smallint default null,
  p_city integer default null,
  p_nationality text default null
)
returns table (month date, onboarded integer)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_tz text := private.company_timezone();
  v_from date := date_trunc('month', p_from_month)::date;
  v_to date := date_trunc('month', p_to_month)::date;
begin
  perform private.require_report_reader();
  if v_from is null or v_to is null or v_from > v_to then
    raise exception 'pick a first and last month, in order' using errcode = 'check_violation';
  end if;
  if v_to > (v_from + interval '10 years')::date then
    raise exception 'at most 10 years at a time' using errcode = 'check_violation';
  end if;

  return query
  select m.month::date,
    coalesce(c.n, 0)::integer
  from generate_series(v_from, v_to, interval '1 month') as m (month)
  left join (
    select date_trunc('month', r.closed_at at time zone v_tz)::date as month, count(*) as n
    from public.requests r
    where r.type = 'onboarding'
      and r.state = 'closed'
      and r.closed_at is not null
      and (p_country is null or r.country = p_country)
      and (p_department is null or r.department_id = p_department)
      and private.request_place_matches(r.office_id, r.region_id, r.office_city_id, r.nationalities,
                                        p_office, p_region, p_city, p_nationality)
      and r.closed_at >= (v_from::timestamp at time zone v_tz)
      and r.closed_at < ((v_to + interval '1 month')::timestamp at time zone v_tz)
    group by 1
  ) c on c.month = m.month::date
  order by m.month;
end;
$$;
comment on function public.report_onboarded_by_month(date, date, text, smallint, smallint, smallint, integer, text)
  is 'Report "Onboarded by month": onboardings closed by the approver per month in the company timezone (D16); zero months included.';

-- ---------------------------------------------------------------------------
-- 4. Onboarded by country / department / office
-- ---------------------------------------------------------------------------
drop function public.report_onboarded_by(text, timestamptz, timestamptz, text, smallint);
create function public.report_onboarded_by(
  p_group text,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_country text default null,
  p_department smallint default null,
  p_office smallint default null,
  p_region smallint default null,
  p_city integer default null,
  p_nationality text default null
)
returns table (key text, label text, onboarded integer)
language plpgsql
stable
set search_path = ''
as $$
begin
  perform private.require_report_reader();
  if p_group is null or p_group not in ('country', 'department', 'office') then
    raise exception 'group must be country, department or office' using errcode = 'check_violation';
  end if;

  return query
  select g.key, g.label, g.n::integer
  from (
    select
      case p_group
        when 'country' then r.country
        when 'department' then r.department_id::text
        else r.office_id::text
      end as key,
      case p_group
        when 'country' then r.country
        when 'department' then d.name
        else o.name
      end as label,
      count(*) as n
    from public.requests r
    left join public.departments d on d.id = r.department_id
    left join public.offices o on o.id = r.office_id
    where r.type = 'onboarding'
      and r.state = 'closed'
      and r.closed_at is not null
      and (p_from is null or r.closed_at >= p_from)
      and (p_to is null or r.closed_at < p_to)
      and (p_country is null or r.country = p_country)
      and (p_department is null or r.department_id = p_department)
      and private.request_place_matches(r.office_id, r.region_id, r.office_city_id, r.nationalities,
                                        p_office, p_region, p_city, p_nationality)
    group by 1, 2
  ) g
  order by g.n desc, g.label nulls last;
end;
$$;
comment on function public.report_onboarded_by(text, timestamptz, timestamptz, text, smallint, smallint, smallint, integer, text)
  is 'Reports "Onboarded by country / department / office": onboardings closed by the approver in the period (D16), per group, biggest first.';

-- ---------------------------------------------------------------------------
-- 5. Signature log
-- ---------------------------------------------------------------------------
drop function public.report_signature_log(timestamptz, timestamptz, public.request_type, text, smallint, text, integer, integer);
create function public.report_signature_log(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_type public.request_type default null,
  p_country text default null,
  p_department smallint default null,
  p_search text default null,
  p_limit integer default 20,
  p_offset integer default 0,
  p_office smallint default null,
  p_region smallint default null,
  p_city integer default null,
  p_nationality text default null
)
returns table (
  id uuid,
  ticket_id text,
  type public.request_type,
  state public.request_state,
  first_name text,
  last_name text,
  work_email text,
  first_signed_at timestamptz,
  first_signed_by text,
  last_signed_at timestamptz,
  it_sha256 text,
  approved_at timestamptz,
  approved_by text,
  final_sha256 text,
  returns integer,
  last_returned_at timestamptz,
  pdf_generated_at timestamptz,
  total_count bigint,
  approved_count bigint,
  returned_count bigint,
  median_seconds double precision
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_report_reader();
  return query
  with it as (
    -- Every IT signature, cleared ones (before a return) included.
    select s.request_id,
      min(s.signed_at) as first_at,
      max(s.signed_at) as last_at,
      (array_agg(s.signer_id order by s.signed_at))[1] as first_by,
      (array_agg(sn.sha256 order by s.signed_at desc))[1] as last_sha
    from public.signatures s
    join public.request_snapshots sn on sn.id = s.snapshot_id
    where s.section = 'it_execution'
    group by s.request_id
  ),
  f as (
    select r.id, r.ticket_id, r.type, r.state, r.first_name, r.last_name, r.work_email,
      it.first_at, it.first_by, it.last_at, it.last_sha,
      conf.decided_at as approved_at, conf.decided_by as approved_by_id, csn.sha256 as final_sha,
      coalesce(ret.n, 0)::integer as returns, ret.last_at as last_returned_at,
      pdf.generated_at as pdf_at
    from public.requests r
    join it on it.request_id = r.id
    left join lateral (
      select a.decided_at, a.decided_by, a.snapshot_id
      from public.approvals a
      where a.request_id = r.id and a.decision = 'confirmed'
      order by a.decided_at desc limit 1
    ) conf on true
    left join public.request_snapshots csn on csn.id = conf.snapshot_id
    left join lateral (
      select count(*) as n, max(a.decided_at) as last_at
      from public.approvals a
      where a.request_id = r.id and a.decision = 'returned'
    ) ret on true
    left join public.pdf_documents pdf on pdf.request_id = r.id
    where private.request_visible(r.id)
      and (p_from is null or it.first_at >= p_from)
      and (p_to is null or it.first_at < p_to)
      and (p_type is null or r.type = p_type)
      and (p_country is null or r.country = p_country)
      and (p_department is null or r.department_id = p_department)
      and private.request_place_matches(r.office_id, r.region_id, r.office_city_id, r.nationalities,
                                        p_office, p_region, p_city, p_nationality)
      and (nullif(trim(p_search), '') is null
           or concat_ws(' ', r.first_name, r.last_name, r.work_email, r.ticket_id)
              ilike '%' || trim(p_search) || '%')
  ),
  totals as (
    select count(*) as total,
      count(*) filter (where f.approved_at is not null) as approved,
      count(*) filter (where f.returns > 0) as returned,
      percentile_cont(0.5) within group (
        order by extract(epoch from f.approved_at - f.first_at)
      ) filter (where f.approved_at is not null) as median
    from f
  )
  select f.id, f.ticket_id, f.type, f.state, f.first_name, f.last_name, f.work_email,
    f.first_at,
    nullif(trim(concat_ws(' ', fu.first_name, fu.last_name)), ''),
    f.last_at, f.last_sha,
    f.approved_at,
    nullif(trim(concat_ws(' ', au.first_name, au.last_name)), ''),
    f.final_sha, f.returns, f.last_returned_at, f.pdf_at,
    t.total, t.approved, t.returned, t.median
  from f
  cross join totals t
  left join public.app_users fu on fu.clerk_user_id = f.first_by
  left join public.app_users au on au.clerk_user_id = f.approved_by_id
  order by f.first_at desc, f.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 10000)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;
comment on function public.report_signature_log(timestamptz, timestamptz, public.request_type, text, smallint, text, integer, integer, smallint, smallint, integer, text)
  is 'Report "Signature log": requests IT first signed in the period, with confirmation, returns, fingerprints and PDF; time to approve from the first Review & sign. Approvers: the usual visibility.';

-- ---------------------------------------------------------------------------
-- 6. Offboarding SLA (list + summary share the rows)
-- ---------------------------------------------------------------------------
drop function public.report_offboarding_sla(timestamptz, timestamptz, text, smallint, text, integer, integer);
drop function public.report_offboarding_sla_summary(timestamptz, timestamptz, text, smallint, text);
drop function private.offboarding_sla_rows(timestamptz, timestamptz, text, smallint, text);

create function private.offboarding_sla_rows(
  p_from timestamptz,
  p_to timestamptz,
  p_country text,
  p_department smallint,
  p_search text,
  p_office smallint,
  p_region smallint,
  p_city integer,
  p_nationality text
)
returns table (
  id uuid,
  ticket_id text,
  state public.request_state,
  first_name text,
  last_name text,
  work_email text,
  sla_timeline public.sla_timeline,
  access_cutoff_at timestamptz,
  sla_due_at timestamptz,
  removals_total integer,
  removals_done integer,
  removed_at timestamptz,
  result text,
  sla_missed_reason text
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.ticket_id, r.state, r.first_name, r.last_name, r.work_email,
    r.sla_timeline, r.access_cutoff_at, r.sla_due_at,
    t.total, t.done,
    case when t.total > 0 and t.done = t.total then t.last_done end,
    case
      when t.total = 0 then 'no_removals'
      when t.done = t.total then case when t.last_done <= r.sla_due_at then 'met' else 'missed' end
      when now() > r.sla_due_at then 'overdue'
      else 'open'
    end,
    r.sla_missed_reason
  from public.requests r
  cross join lateral (
    select count(*)::int as total, count(x.done_at)::int as done, max(x.done_at) as last_done
    from (
      select i.done_at from public.request_access_items i where i.request_id = r.id
      union all
      select p.done_at from public.request_physical_access_items p where p.request_id = r.id
    ) x
  ) t
  where r.type = 'offboarding'
    and r.state <> 'cancelled'
    and r.execution_started_at is not null
    and r.sla_due_at is not null
    and private.request_visible(r.id)
    and (p_from is null or r.sla_due_at >= p_from)
    and (p_to is null or r.sla_due_at < p_to)
    and (p_country is null or r.country = p_country)
    and (p_department is null or r.department_id = p_department)
    and private.request_place_matches(r.office_id, r.region_id, r.office_city_id, r.nationalities,
                                      p_office, p_region, p_city, p_nationality)
    and (nullif(trim(p_search), '') is null
         or concat_ws(' ', r.first_name, r.last_name, r.work_email, r.ticket_id)
            ilike '%' || trim(p_search) || '%');
$$;
revoke all on function private.offboarding_sla_rows(timestamptz, timestamptz, text, smallint, text, smallint, smallint, integer, text) from public;

create function public.report_offboarding_sla(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_country text default null,
  p_department smallint default null,
  p_search text default null,
  p_limit integer default 20,
  p_offset integer default 0,
  p_office smallint default null,
  p_region smallint default null,
  p_city integer default null,
  p_nationality text default null
)
returns table (
  id uuid,
  ticket_id text,
  state public.request_state,
  first_name text,
  last_name text,
  work_email text,
  sla_timeline public.sla_timeline,
  access_cutoff_at timestamptz,
  sla_due_at timestamptz,
  removals_total integer,
  removals_done integer,
  removed_at timestamptz,
  result text,
  sla_missed_reason text,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_report_reader();
  return query
  select s.*, count(*) over ()
  from private.offboarding_sla_rows(p_from, p_to, p_country, p_department, p_search,
                                    p_office, p_region, p_city, p_nationality) s
  order by s.sla_due_at desc, s.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 10000)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;
comment on function public.report_offboarding_sla(timestamptz, timestamptz, text, smallint, text, integer, integer, smallint, smallint, integer, text)
  is 'Report "Offboarding SLA": offboardings whose deadline falls in the period (from Start execution on), newest deadline first, with met / missed / open / overdue from the removal ticks.';

create function public.report_offboarding_sla_summary(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_country text default null,
  p_department smallint default null,
  p_search text default null,
  p_office smallint default null,
  p_region smallint default null,
  p_city integer default null,
  p_nationality text default null
)
returns table (
  sla_timeline public.sla_timeline,
  met integer,
  missed integer,
  open integer,
  overdue integer,
  no_removals integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_report_reader();
  return query
  select s.sla_timeline,
    count(*) filter (where s.result = 'met')::int,
    count(*) filter (where s.result = 'missed')::int,
    count(*) filter (where s.result = 'open')::int,
    count(*) filter (where s.result = 'overdue')::int,
    count(*) filter (where s.result = 'no_removals')::int
  from private.offboarding_sla_rows(p_from, p_to, p_country, p_department, p_search,
                                    p_office, p_region, p_city, p_nationality) s
  group by s.sla_timeline
  order by s.sla_timeline;
end;
$$;
comment on function public.report_offboarding_sla_summary(timestamptz, timestamptz, text, smallint, text, smallint, smallint, integer, text)
  is 'Report "Offboarding SLA": met / missed / open / overdue per timeline (same scope as report_offboarding_sla).';

-- ---------------------------------------------------------------------------
-- 7. Access by application (filters on the latest closed request)
-- ---------------------------------------------------------------------------
drop function public.report_access_by_item(public.inventory_kind, smallint, text, text);
drop function public.report_access_holders(public.inventory_kind, text, smallint, text, text, integer, integer);
drop function private.access_held_rows(public.inventory_kind, smallint, text, text);

create function private.access_held_rows(
  p_kind public.inventory_kind,
  p_department smallint,
  p_country text,
  p_search text,
  p_office smallint,
  p_region smallint,
  p_city integer,
  p_nationality text
)
returns table (
  inventory_id uuid,
  item_key text,
  name text,
  category_name text,
  permission text,
  description text,
  asset_tag text,
  source text,
  granted_at timestamptz,
  granted_request_id uuid,
  granted_ticket_id text,
  employee_id uuid,
  first_name text,
  last_name text,
  work_email text,
  department text,
  country text,
  office text,
  leaving_request_id uuid,
  leaving_ticket_id text
)
language sql
stable
set search_path = ''
as $$
  select i.id, private.inventory_item_key(i), i.name, i.category_name, i.permission,
    i.description, i.asset_tag, i.source, i.granted_at, i.granted_request_id, g.ticket_id,
    e.id, coalesce(lc.first_name, e.first_name), coalesce(lc.last_name, e.last_name), e.work_email,
    d.name, lc.country, o.name,
    lv.id, lv.ticket_id
  from public.employee_access_inventory i
  join public.employees e on e.id = i.employee_id
  left join public.requests g on g.id = i.granted_request_id
  left join lateral (
    select r.first_name, r.last_name, r.department_id, r.country,
      r.office_id, r.region_id, r.office_city_id, r.nationalities
    from public.requests r
    where r.employee_id = e.id and r.state = 'closed'
    order by r.closed_at desc nulls last
    limit 1
  ) lc on true
  left join public.departments d on d.id = lc.department_id
  left join public.offices o on o.id = lc.office_id
  left join lateral (
    select r.id, r.ticket_id
    from public.requests r
    where r.employee_id = e.id and r.type = 'offboarding'
      and r.state not in ('closed', 'cancelled')
    order by r.created_at desc
    limit 1
  ) lv on true
  where i.ended_at is null
    and i.kind = coalesce(p_kind, 'application')
    and (p_department is null or lc.department_id = p_department)
    and (p_country is null or lc.country = p_country)
    and private.request_place_matches(lc.office_id, lc.region_id, lc.office_city_id, lc.nationalities,
                                      p_office, p_region, p_city, p_nationality)
    and (nullif(trim(p_search), '') is null
         or concat_ws(' ', i.name, e.first_name, e.last_name, e.work_email)
            ilike '%' || trim(p_search) || '%');
$$;
grant execute on function private.access_held_rows(public.inventory_kind, smallint, text, text, smallint, smallint, integer, text) to authenticated;

create function public.report_access_by_item(
  p_kind public.inventory_kind default 'application',
  p_department smallint default null,
  p_country text default null,
  p_search text default null,
  p_office smallint default null,
  p_region smallint default null,
  p_city integer default null,
  p_nationality text default null
)
returns table (
  item_key text,
  name text,
  category_name text,
  holders integer,
  total_people bigint,
  total_rights bigint,
  items_in_use bigint,
  catalog_count bigint,
  leaving_people bigint
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_catalog bigint;
begin
  perform private.require_report_reader();
  v_catalog := case coalesce(p_kind, 'application')
    when 'application' then (select count(*) from public.catalog_apps a where a.active)
    when 'equipment' then (select count(*) from public.equipment_types t where t.active)
    else (select count(*) from public.physical_access_types t where t.active)
  end;

  return query
  with h as (
    select * from private.access_held_rows(p_kind, p_department, p_country, p_search,
                                           p_office, p_region, p_city, p_nationality)
  ),
  totals as (
    select count(distinct h.employee_id) as people, count(*) as rights,
      count(distinct h.item_key) as items,
      count(distinct h.employee_id) filter (where h.leaving_request_id is not null) as leaving
    from h
  )
  select g.item_key, g.name, g.category_name, g.n::integer,
    t.people, t.rights, t.items, v_catalog, t.leaving
  from (
    select h.item_key, min(h.name) as name, min(h.category_name) as category_name,
      count(distinct h.employee_id) as n
    from h
    group by h.item_key
  ) g
  cross join totals t
  order by g.n desc, g.name;
end;
$$;
comment on function public.report_access_by_item(public.inventory_kind, smallint, text, text, smallint, smallint, integer, text)
  is 'Report "Access by application": who holds what today (access inventory), people per application / device / access type, most first, with totals.';

create function public.report_access_holders(
  p_kind public.inventory_kind default 'application',
  p_item_key text default null,
  p_department smallint default null,
  p_country text default null,
  p_search text default null,
  p_limit integer default 20,
  p_offset integer default 0,
  p_office smallint default null,
  p_region smallint default null,
  p_city integer default null,
  p_nationality text default null
)
returns table (
  inventory_id uuid,
  item_key text,
  name text,
  category_name text,
  permission text,
  description text,
  asset_tag text,
  source text,
  granted_at timestamptz,
  granted_request_id uuid,
  granted_ticket_id text,
  first_name text,
  last_name text,
  work_email text,
  department text,
  country text,
  office text,
  leaving_request_id uuid,
  leaving_ticket_id text,
  total_count bigint,
  permission_counts jsonb
)
language plpgsql
stable
set search_path = ''
as $$
begin
  perform private.require_report_reader();
  return query
  with h as (
    select * from private.access_held_rows(p_kind, p_department, p_country, p_search,
                                           p_office, p_region, p_city, p_nationality) x
    where p_item_key is null or x.item_key = p_item_key
  ),
  perms as (
    select coalesce(jsonb_object_agg(c.permission, c.n), '{}'::jsonb) as counts
    from (
      select coalesce(h.permission, '') as permission, count(*) as n from h group by 1
    ) c
  )
  select h.inventory_id, h.item_key, h.name, h.category_name, h.permission, h.description,
    h.asset_tag, h.source, h.granted_at, h.granted_request_id, h.granted_ticket_id,
    h.first_name, h.last_name, h.work_email, h.department, h.country, h.office,
    h.leaving_request_id, h.leaving_ticket_id,
    count(*) over (), p.counts
  from h
  cross join perms p
  order by h.name, h.last_name nulls last, h.first_name nulls last, h.work_email, h.inventory_id
  limit least(greatest(coalesce(p_limit, 20), 1), 10000)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;
comment on function public.report_access_holders(public.inventory_kind, text, smallint, text, text, integer, integer, smallint, smallint, integer, text)
  is 'Report "Access by application": the people holding one item today (or every held row of the kind), with permission, office, since when and the granting request.';

-- ---------------------------------------------------------------------------
-- 8. Grants
-- ---------------------------------------------------------------------------
revoke all on function public.report_all_users(timestamptz, timestamptz, public.request_type, text, smallint, text, integer, integer, smallint, smallint, integer, text) from public, anon;
revoke all on function public.report_onboarded_by_month(date, date, text, smallint, smallint, smallint, integer, text) from public, anon;
revoke all on function public.report_onboarded_by(text, timestamptz, timestamptz, text, smallint, smallint, smallint, integer, text) from public, anon;
revoke all on function public.report_signature_log(timestamptz, timestamptz, public.request_type, text, smallint, text, integer, integer, smallint, smallint, integer, text) from public, anon;
revoke all on function public.report_offboarding_sla(timestamptz, timestamptz, text, smallint, text, integer, integer, smallint, smallint, integer, text) from public, anon;
revoke all on function public.report_offboarding_sla_summary(timestamptz, timestamptz, text, smallint, text, smallint, smallint, integer, text) from public, anon;
revoke all on function public.report_access_by_item(public.inventory_kind, smallint, text, text, smallint, smallint, integer, text) from public, anon;
revoke all on function public.report_access_holders(public.inventory_kind, text, smallint, text, text, integer, integer, smallint, smallint, integer, text) from public, anon;
grant execute on function public.report_all_users(timestamptz, timestamptz, public.request_type, text, smallint, text, integer, integer, smallint, smallint, integer, text) to authenticated;
grant execute on function public.report_onboarded_by_month(date, date, text, smallint, smallint, smallint, integer, text) to authenticated;
grant execute on function public.report_onboarded_by(text, timestamptz, timestamptz, text, smallint, smallint, smallint, integer, text) to authenticated;
grant execute on function public.report_signature_log(timestamptz, timestamptz, public.request_type, text, smallint, text, integer, integer, smallint, smallint, integer, text) to authenticated;
grant execute on function public.report_offboarding_sla(timestamptz, timestamptz, text, smallint, text, integer, integer, smallint, smallint, integer, text) to authenticated;
grant execute on function public.report_offboarding_sla_summary(timestamptz, timestamptz, text, smallint, text, smallint, smallint, integer, text) to authenticated;
grant execute on function public.report_access_by_item(public.inventory_kind, smallint, text, text, smallint, smallint, integer, text) to authenticated;
grant execute on function public.report_access_holders(public.inventory_kind, text, smallint, text, text, integer, integer, smallint, smallint, integer, text) to authenticated;

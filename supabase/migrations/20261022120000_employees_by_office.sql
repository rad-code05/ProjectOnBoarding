-- F27e: "Employees by office" — the headcount today.
--
-- Employed today = an onboarding closed by the approver and no offboarding
-- closed since (a later onboarding — a re-hire — counts again). Where they
-- work comes from their latest closed request (any type), like Access by
-- application. Someone with an open offboarding still counts, marked
-- Leaving. Security invoker: RLS decides which requests count for the reader
-- (approvers never see drafts, so a draft offboarding is not "Leaving" for
-- them). Same filters as every report (F27d-1), no period: today.
--
--   report_employees_by_office()  one row per office · state · city
--   report_employees()            the people (the drill-down list and the CSV)

create function private.employee_rows(
  p_department smallint,
  p_country text,
  p_search text,
  p_office smallint,
  p_region smallint,
  p_city integer,
  p_nationality text
)
returns table (
  employee_id uuid,
  first_name text,
  last_name text,
  work_email text,
  department text,
  country text,
  office_id smallint,
  office text,
  office_sort smallint,
  region_id smallint,
  region text,
  city_id integer,
  city text,
  nationalities text[],
  onboarded_at timestamptz,
  latest_request_id uuid,
  latest_ticket_id text,
  leaving_request_id uuid,
  leaving_ticket_id text
)
language sql
stable
set search_path = ''
as $$
  select e.id, coalesce(lc.first_name, e.first_name), coalesce(lc.last_name, e.last_name), e.work_email,
    d.name, lc.country, lc.office_id, o.name, o.sort_order, lc.region_id, rg.name, lc.office_city_id, oc.name,
    lc.nationalities, ob.closed_at, lc.id, lc.ticket_id, lv.id, lv.ticket_id
  from public.employees e
  -- The latest closed onboarding …
  join lateral (
    select r.closed_at
    from public.requests r
    where r.employee_id = e.id and r.type = 'onboarding' and r.state = 'closed'
      and r.closed_at is not null
    order by r.closed_at desc
    limit 1
  ) ob on true
  -- … the latest closed request of any type (where they work today) …
  join lateral (
    select r.id, r.ticket_id, r.first_name, r.last_name, r.department_id, r.country,
      r.office_id, r.region_id, r.office_city_id, r.nationalities
    from public.requests r
    where r.employee_id = e.id and r.state = 'closed'
    order by r.closed_at desc nulls last
    limit 1
  ) lc on true
  left join public.departments d on d.id = lc.department_id
  left join public.offices o on o.id = lc.office_id
  left join public.country_regions rg on rg.id = lc.region_id
  left join public.office_cities oc on oc.id = lc.office_city_id
  -- … and an offboarding that is still open (Leaving).
  left join lateral (
    select r.id, r.ticket_id
    from public.requests r
    where r.employee_id = e.id and r.type = 'offboarding'
      and r.state not in ('closed', 'cancelled')
    order by r.created_at desc
    limit 1
  ) lv on true
  where not exists (
      select 1 from public.requests f
      where f.employee_id = e.id and f.type = 'offboarding' and f.state = 'closed'
        and f.closed_at >= ob.closed_at
    )
    and (p_department is null or lc.department_id = p_department)
    and (p_country is null or lc.country = p_country)
    and private.request_place_matches(lc.office_id, lc.region_id, lc.office_city_id, lc.nationalities,
                                      p_office, p_region, p_city, p_nationality)
    and (nullif(trim(p_search), '') is null
         or concat_ws(' ', lc.first_name, lc.last_name, e.work_email, lc.ticket_id)
            ilike '%' || trim(p_search) || '%');
$$;
comment on function private.employee_rows(smallint, text, text, smallint, smallint, integer, text)
  is 'People employed today (closed onboarding, no closed offboarding since), placed by their latest closed request; RLS of the caller applies.';
revoke all on function private.employee_rows(smallint, text, text, smallint, smallint, integer, text) from public;
grant execute on function private.employee_rows(smallint, text, text, smallint, smallint, integer, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Headcount per office · state · city
-- ---------------------------------------------------------------------------
create function public.report_employees_by_office(
  p_department smallint default null,
  p_country text default null,
  p_office smallint default null,
  p_region smallint default null,
  p_city integer default null,
  p_nationality text default null
)
returns table (
  office_id smallint,
  office text,
  region_id smallint,
  region text,
  city_id integer,
  city text,
  employees integer,
  leaving integer
)
language plpgsql
stable
set search_path = ''
as $$
begin
  perform private.require_report_reader();
  return query
  select p.office_id, p.office, p.region_id, p.region, p.city_id, p.city,
    count(*)::integer,
    (count(*) filter (where p.leaving_request_id is not null))::integer
  from private.employee_rows(p_department, p_country, null,
                             p_office, p_region, p_city, p_nationality) p
  group by p.office_id, p.office, p.office_sort, p.region_id, p.region, p.city_id, p.city
  order by p.office_sort nulls last, p.office, p.region nulls first, p.city nulls first;
end;
$$;
comment on function public.report_employees_by_office(smallint, text, smallint, smallint, integer, text)
  is 'Report "Employees by office": people employed today per office, US state and city, with how many are leaving.';

-- ---------------------------------------------------------------------------
-- The people
-- ---------------------------------------------------------------------------
create function public.report_employees(
  p_department smallint default null,
  p_country text default null,
  p_search text default null,
  p_office smallint default null,
  p_region smallint default null,
  p_city integer default null,
  p_nationality text default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  employee_id uuid,
  first_name text,
  last_name text,
  work_email text,
  department text,
  country text,
  office text,
  region text,
  city text,
  nationalities text[],
  onboarded_at timestamptz,
  latest_request_id uuid,
  latest_ticket_id text,
  leaving_request_id uuid,
  leaving_ticket_id text,
  total_count bigint
)
language plpgsql
stable
set search_path = ''
as $$
begin
  perform private.require_report_reader();
  return query
  with p as (
    select * from private.employee_rows(p_department, p_country, p_search,
                                        p_office, p_region, p_city, p_nationality)
  )
  select p.employee_id, p.first_name, p.last_name, p.work_email, p.department, p.country,
    p.office, p.region, p.city, p.nationalities, p.onboarded_at,
    p.latest_request_id, p.latest_ticket_id, p.leaving_request_id, p.leaving_ticket_id,
    (select count(*) from p)
  from p
  order by p.office_sort nulls last, p.office, p.region nulls first, p.city nulls first,
    p.last_name, p.first_name, p.work_email
  limit least(greatest(coalesce(p_limit, 20), 1), 10000)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;
comment on function public.report_employees(smallint, text, text, smallint, smallint, integer, text, integer, integer)
  is 'Report "Employees by office": the people employed today, by office, state, city and name, with Leaving.';

revoke all on function public.report_employees_by_office(smallint, text, smallint, smallint, integer, text) from public, anon;
revoke all on function public.report_employees(smallint, text, text, smallint, smallint, integer, text, integer, integer) from public, anon;
grant execute on function public.report_employees_by_office(smallint, text, smallint, smallint, integer, text) to authenticated;
grant execute on function public.report_employees(smallint, text, text, smallint, smallint, integer, text, integer, integer) to authenticated;

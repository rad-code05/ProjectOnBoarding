-- F14a — Reports III (database part).
--
--   * report_offboarding_sla(…) + report_offboarding_sla_summary(…):
--     offboardings whose access-removal DEADLINE falls in the period, once
--     execution has started (the deadline is fixed from then on); cancelled
--     ones left out. Result from the removal ticks (server time), never typed:
--     met / missed once every removal is ticked, open / overdue before that.
--     Equipment returns are not part of the SLA (F09). Security definer like
--     the signature log (approvers may not read the item rows); the usual
--     visibility is applied (private.request_visible).
--   * report_access_by_item(…) + report_access_holders(…): who holds what
--     TODAY, from the access inventory (rows not ended), per application /
--     device / access type, and the people holding one item. Department and
--     country come from the person's latest closed request. "Leaving" = an
--     open offboarding the caller may see. Runs as the caller (RLS decides).
--   * report_open_requests(…): every request not closed or cancelled, right
--     now, with the time since it reached its current status and, for
--     offboardings, the SLA. Security definer + request_visible (approvers:
--     awaiting confirmation and returned only).
--   * Exports keep using log_report_export() (F12a).

-- ---------------------------------------------------------------------------
-- 1. Offboarding SLA
-- ---------------------------------------------------------------------------
-- One row per offboarding in scope, with its result. Shared by the list and
-- the summary; callers check the reader role and visibility.
create function private.offboarding_sla_rows(
  p_from timestamptz,
  p_to timestamptz,
  p_country text,
  p_department smallint,
  p_search text
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
    and (nullif(trim(p_search), '') is null
         or concat_ws(' ', r.first_name, r.last_name, r.work_email, r.ticket_id)
            ilike '%' || trim(p_search) || '%');
$$;
revoke all on function private.offboarding_sla_rows(timestamptz, timestamptz, text, smallint, text) from public;

create function public.report_offboarding_sla(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_country text default null,
  p_department smallint default null,
  p_search text default null,
  p_limit integer default 20,
  p_offset integer default 0
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
  from private.offboarding_sla_rows(p_from, p_to, p_country, p_department, p_search) s
  order by s.sla_due_at desc, s.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 10000)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;
comment on function public.report_offboarding_sla(timestamptz, timestamptz, text, smallint, text, integer, integer)
  is 'Report "Offboarding SLA": offboardings whose deadline falls in the period (from Start execution on), newest deadline first, with met / missed / open / overdue from the removal ticks.';

-- Counts per timeline for the tiles and the "By timeline" table.
create function public.report_offboarding_sla_summary(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_country text default null,
  p_department smallint default null,
  p_search text default null
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
  from private.offboarding_sla_rows(p_from, p_to, p_country, p_department, p_search) s
  group by s.sla_timeline
  order by s.sla_timeline;
end;
$$;
comment on function public.report_offboarding_sla_summary(timestamptz, timestamptz, text, smallint, text)
  is 'Report "Offboarding SLA": met / missed / open / overdue per timeline (same scope as report_offboarding_sla).';

-- ---------------------------------------------------------------------------
-- 2. Access by application (today, from the inventory)
-- ---------------------------------------------------------------------------
-- The item a held row belongs to: catalog id, or the name of an "Other" app.
create function private.inventory_item_key(p_row public.employee_access_inventory)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_row.kind
    when 'application' then coalesce('app:' || p_row.app_id, 'other:' || lower(p_row.name))
    when 'equipment' then 'equipment:' || p_row.equipment_type_id
    else 'access:' || p_row.access_type_id
  end
$$;
grant execute on function private.inventory_item_key(public.employee_access_inventory) to authenticated;

-- Held rows with the person, their department / country (latest closed
-- request) and an open offboarding the caller may see. Runs as the caller.
create function private.access_held_rows(
  p_kind public.inventory_kind,
  p_department smallint,
  p_country text,
  p_search text
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
    d.name, lc.country,
    lv.id, lv.ticket_id
  from public.employee_access_inventory i
  join public.employees e on e.id = i.employee_id
  left join public.requests g on g.id = i.granted_request_id
  left join lateral (
    select r.first_name, r.last_name, r.department_id, r.country
    from public.requests r
    where r.employee_id = e.id and r.state = 'closed'
    order by r.closed_at desc nulls last
    limit 1
  ) lc on true
  left join public.departments d on d.id = lc.department_id
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
    and (nullif(trim(p_search), '') is null
         or concat_ws(' ', i.name, e.first_name, e.last_name, e.work_email)
            ilike '%' || trim(p_search) || '%');
$$;
grant execute on function private.access_held_rows(public.inventory_kind, smallint, text, text) to authenticated;

-- One row per item somebody holds, most holders first, with the totals.
create function public.report_access_by_item(
  p_kind public.inventory_kind default 'application',
  p_department smallint default null,
  p_country text default null,
  p_search text default null
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
    select * from private.access_held_rows(p_kind, p_department, p_country, p_search)
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
comment on function public.report_access_by_item(public.inventory_kind, smallint, text, text)
  is 'Report "Access by application": who holds what today (access inventory), people per application / device / access type, most first, with totals.';

-- The people holding one item (p_item_key) — or every held row of the kind
-- (p_item_key null, for the full CSV). permission_counts covers all rows.
create function public.report_access_holders(
  p_kind public.inventory_kind default 'application',
  p_item_key text default null,
  p_department smallint default null,
  p_country text default null,
  p_search text default null,
  p_limit integer default 20,
  p_offset integer default 0
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
    select * from private.access_held_rows(p_kind, p_department, p_country, p_search) x
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
    h.first_name, h.last_name, h.work_email, h.department, h.country,
    h.leaving_request_id, h.leaving_ticket_id,
    count(*) over (), p.counts
  from h
  cross join perms p
  order by h.name, h.last_name nulls last, h.first_name nulls last, h.work_email, h.inventory_id
  limit least(greatest(coalesce(p_limit, 20), 1), 10000)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;
comment on function public.report_access_holders(public.inventory_kind, text, smallint, text, text, integer, integer)
  is 'Report "Access by application": the people holding one item today (or every held row of the kind), with permission, since when and the granting request.';

-- ---------------------------------------------------------------------------
-- 3. Open requests by status
-- ---------------------------------------------------------------------------
create function public.report_open_requests(
  p_type public.request_type default null,
  p_search text default null,
  p_limit integer default 500
)
returns table (
  id uuid,
  ticket_id text,
  type public.request_type,
  state public.request_state,
  first_name text,
  last_name text,
  work_email text,
  created_at timestamptz,
  waiting_since timestamptz,
  sla_due_at timestamptz,
  sla_result text,
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
  select r.id, r.ticket_id, r.type, r.state, r.first_name, r.last_name, r.work_email,
    r.created_at, coalesce(r.state_changed_at, r.created_at),
    r.sla_due_at,
    case when r.type = 'offboarding' and r.execution_started_at is not null and r.sla_due_at is not null then
      case
        when t.total = 0 then null
        when t.done = t.total then case when t.last_done <= r.sla_due_at then 'met' else 'missed' end
        when now() > r.sla_due_at then 'overdue'
        else 'open'
      end
    end,
    count(*) over ()
  from public.requests r
  left join lateral (
    select count(*)::int as total, count(x.done_at)::int as done, max(x.done_at) as last_done
    from (
      select i.done_at from public.request_access_items i where i.request_id = r.id
      union all
      select p.done_at from public.request_physical_access_items p where p.request_id = r.id
    ) x
  ) t on r.type = 'offboarding'
  where r.state not in ('closed', 'cancelled')
    and private.request_visible(r.id)
    and (p_type is null or r.type = p_type)
    and (nullif(trim(p_search), '') is null
         or concat_ws(' ', r.first_name, r.last_name, r.work_email, r.ticket_id)
            ilike '%' || trim(p_search) || '%')
  order by coalesce(r.state_changed_at, r.created_at), r.id
  limit least(greatest(coalesce(p_limit, 500), 1), 10000);
end;
$$;
comment on function public.report_open_requests(public.request_type, text, integer)
  is 'Report "Open requests by status": requests not closed or cancelled, longest waiting first, with the time they reached their status and the offboarding SLA. Approvers: awaiting confirmation and returned.';

-- ---------------------------------------------------------------------------
-- 4. Grants and indexes
-- ---------------------------------------------------------------------------
revoke all on function public.report_offboarding_sla(timestamptz, timestamptz, text, smallint, text, integer, integer) from public, anon;
revoke all on function public.report_offboarding_sla_summary(timestamptz, timestamptz, text, smallint, text) from public, anon;
revoke all on function public.report_access_by_item(public.inventory_kind, smallint, text, text) from public, anon;
revoke all on function public.report_access_holders(public.inventory_kind, text, smallint, text, text, integer, integer) from public, anon;
revoke all on function public.report_open_requests(public.request_type, text, integer) from public, anon;
grant execute on function public.report_offboarding_sla(timestamptz, timestamptz, text, smallint, text, integer, integer) to authenticated;
grant execute on function public.report_offboarding_sla_summary(timestamptz, timestamptz, text, smallint, text) to authenticated;
grant execute on function public.report_access_by_item(public.inventory_kind, smallint, text, text) to authenticated;
grant execute on function public.report_access_holders(public.inventory_kind, text, smallint, text, text, integer, integer) to authenticated;
grant execute on function public.report_open_requests(public.request_type, text, integer) to authenticated;

create index requests_offboarding_sla_idx on public.requests (sla_due_at)
  where type = 'offboarding' and sla_due_at is not null;
create index requests_open_idx on public.requests (state_changed_at)
  where state not in ('closed', 'cancelled');
create index requests_employee_closed_idx on public.requests (employee_id, closed_at desc)
  where state = 'closed';

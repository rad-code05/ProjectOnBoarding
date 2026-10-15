-- F12a — Reports I (database part).
--
--   * report_all_users(…): everyone with a request created in the period
--     (cancelled left out), newest first, with filters and the total. Runs
--     as the caller, so the requests RLS decides what each person sees:
--     approvers only awaiting confirmation, returned and closed (decided
--     2026-10-15 — the same rule as everywhere).
--   * report_onboarded_by_month(…): onboardings CLOSED by the approver per
--     month, in the company timezone (D16, decided 2026-10-15), every month
--     of the range listed — zero included.
--   * log_report_export(…): every CSV / PDF export of a report is written to
--     the audit log ("report.exported", with its filters and row count).
--   * Reports are for admins, approvers and auditors (Reports page).

-- ---------------------------------------------------------------------------
-- 1. Who may read reports
-- ---------------------------------------------------------------------------
create function private.require_report_reader()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user text := private.current_user_id();
begin
  if v_user is null or not private.is_active_user()
     or not private.has_any_role(array['admin', 'approver', 'auditor']::public.app_role[]) then
    raise exception 'only admins, approvers and auditors read reports' using errcode = 'insufficient_privilege';
  end if;
  return v_user;
end;
$$;
revoke all on function private.require_report_reader() from public;
grant execute on function private.require_report_reader() to authenticated;

-- Report exports belong to "Records & PDFs" in the audit log filters.
create or replace function private.audit_group(p_action text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_action in ('request.signed', 'request.confirmed', 'request.returned')
      or p_action like 'signature.%' then 'signatures'
    when p_action like 'record.%' or p_action like 'audit.%'
      or p_action like 'report.%' then 'records'
    when p_action like 'request.%' or p_action like 'employee.%'
      or p_action like 'inventory.%' then 'requests'
    when p_action like 'session.%' or p_action like 'account.%' then 'accounts'
    else 'admin' -- catalog.*, settings.*, user.*, role.*, dev.*
  end
$$;

-- ---------------------------------------------------------------------------
-- 2. All users list
-- ---------------------------------------------------------------------------
-- p_from (inclusive) … p_to (exclusive): instants; the app turns days in the
-- company timezone into them. Search: name, work email or ticket.
create function public.report_all_users(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_type public.request_type default null,
  p_country text default null,
  p_department smallint default null,
  p_search text default null,
  p_limit integer default 20,
  p_offset integer default 0
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
           r.created_at, r.closed_at
    from public.requests r
    left join public.departments d on d.id = r.department_id
    where r.state <> 'cancelled'
      and (p_from is null or r.created_at >= p_from)
      and (p_to is null or r.created_at < p_to)
      and (p_type is null or r.type = p_type)
      and (p_country is null or r.country = p_country)
      and (p_department is null or r.department_id = p_department)
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
comment on function public.report_all_users(timestamptz, timestamptz, public.request_type, text, smallint, text, integer, integer)
  is 'Report "All users list": requests created in the period (not cancelled), newest first; RLS decides visibility.';

-- ---------------------------------------------------------------------------
-- 3. Onboarded by month (D16: closed by the approver, company timezone)
-- ---------------------------------------------------------------------------
-- p_from_month / p_to_month: any day of the first and last month (inclusive).
create function public.report_onboarded_by_month(
  p_from_month date,
  p_to_month date,
  p_country text default null,
  p_department smallint default null
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
      and r.closed_at >= (v_from::timestamp at time zone v_tz)
      and r.closed_at < ((v_to + interval '1 month')::timestamp at time zone v_tz)
    group by 1
  ) c on c.month = m.month::date
  order by m.month;
end;
$$;
comment on function public.report_onboarded_by_month(date, date, text, smallint)
  is 'Report "Onboarded by month": onboardings closed by the approver per month in the company timezone (D16); zero months included.';

-- ---------------------------------------------------------------------------
-- 4. Every export is audited
-- ---------------------------------------------------------------------------
create function public.log_report_export(
  p_report text,
  p_format text,
  p_filters jsonb default '{}'::jsonb,
  p_rows integer default 0
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_report_reader();
  if p_report is null or p_report !~ '^[a-z_]{1,40}$' then
    raise exception 'unknown report' using errcode = 'check_violation';
  end if;
  if p_format is null or p_format not in ('csv', 'pdf') then
    raise exception 'format must be csv or pdf' using errcode = 'check_violation';
  end if;
  perform private.write_audit('report.exported', 'report', p_report,
    jsonb_build_object('format', p_format, 'rows', greatest(coalesce(p_rows, 0), 0),
      'filters', jsonb_strip_nulls(coalesce(p_filters, '{}'::jsonb))));
end;
$$;
comment on function public.log_report_export(text, text, jsonb, integer)
  is 'Audit event for one CSV / PDF export of a report (admins, approvers, auditors).';

-- ---------------------------------------------------------------------------
-- 5. Grants
-- ---------------------------------------------------------------------------
revoke all on function public.report_all_users(timestamptz, timestamptz, public.request_type, text, smallint, text, integer, integer) from public, anon;
revoke all on function public.report_onboarded_by_month(date, date, text, smallint) from public, anon;
revoke all on function public.log_report_export(text, text, jsonb, integer) from public, anon;
grant execute on function public.report_all_users(timestamptz, timestamptz, public.request_type, text, smallint, text, integer, integer) to authenticated;
grant execute on function public.report_onboarded_by_month(date, date, text, smallint) to authenticated;
grant execute on function public.log_report_export(text, text, jsonb, integer) to authenticated;

create index requests_closed_onboarding_idx on public.requests (closed_at)
  where type = 'onboarding' and state = 'closed';

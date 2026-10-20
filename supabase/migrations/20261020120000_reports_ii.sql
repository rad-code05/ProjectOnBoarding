-- F13a — Reports II (database part).
--
--   * report_onboarded_by(group, …): onboardings CLOSED by the approver in the
--     period (D16), grouped by country or by department, biggest first. Runs
--     as the caller (RLS on requests decides).
--   * report_signature_log(…): every request IT FIRST signed (Review & sign)
--     in the period, newest first — first signature (when, who), the
--     confirmation (when, who), returns, fingerprints, PDF — plus the totals
--     for the tiles. Time to approve = first Review & sign → confirmation,
--     returns included (decided 2026-10-20). Security definer because
--     approvers may not read other people's names; it applies the usual
--     visibility itself (private.request_visible: approvers see awaiting
--     confirmation, returned and closed only).
--   * Exports keep using log_report_export() (F12a).

-- ---------------------------------------------------------------------------
-- 1. Onboarded by country / department
-- ---------------------------------------------------------------------------
-- p_from (inclusive) … p_to (exclusive): instants; the app turns days in the
-- company timezone into them. key = country code / department id (null =
-- not filled in on the request); label = department name (country names are
-- written by the app).
create function public.report_onboarded_by(
  p_group text,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_country text default null,
  p_department smallint default null
)
returns table (key text, label text, onboarded integer)
language plpgsql
stable
set search_path = ''
as $$
begin
  perform private.require_report_reader();
  if p_group is null or p_group not in ('country', 'department') then
    raise exception 'group must be country or department' using errcode = 'check_violation';
  end if;

  return query
  select g.key, g.label, g.n::integer
  from (
    select
      case when p_group = 'country' then r.country else r.department_id::text end as key,
      case when p_group = 'country' then r.country else d.name end as label,
      count(*) as n
    from public.requests r
    left join public.departments d on d.id = r.department_id
    where r.type = 'onboarding'
      and r.state = 'closed'
      and r.closed_at is not null
      and (p_from is null or r.closed_at >= p_from)
      and (p_to is null or r.closed_at < p_to)
      and (p_country is null or r.country = p_country)
      and (p_department is null or r.department_id = p_department)
    group by 1, 2
  ) g
  order by g.n desc, g.label nulls last;
end;
$$;
comment on function public.report_onboarded_by(text, timestamptz, timestamptz, text, smallint)
  is 'Reports "Onboarded by country / department": onboardings closed by the approver in the period (D16), per group, biggest first.';

-- ---------------------------------------------------------------------------
-- 2. Signature log
-- ---------------------------------------------------------------------------
create function public.report_signature_log(
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
comment on function public.report_signature_log(timestamptz, timestamptz, public.request_type, text, smallint, text, integer, integer)
  is 'Report "Signature log": requests IT first signed in the period, with confirmation, returns, fingerprints and PDF; time to approve from the first Review & sign. Approvers: the usual visibility.';

-- ---------------------------------------------------------------------------
-- 3. Grants
-- ---------------------------------------------------------------------------
revoke all on function public.report_onboarded_by(text, timestamptz, timestamptz, text, smallint) from public, anon;
revoke all on function public.report_signature_log(timestamptz, timestamptz, public.request_type, text, smallint, text, integer, integer) from public, anon;
grant execute on function public.report_onboarded_by(text, timestamptz, timestamptz, text, smallint) to authenticated;
grant execute on function public.report_signature_log(timestamptz, timestamptz, public.request_type, text, smallint, text, integer, integer) to authenticated;

create index signatures_it_request_idx on public.signatures (request_id, signed_at)
  where section = 'it_execution';

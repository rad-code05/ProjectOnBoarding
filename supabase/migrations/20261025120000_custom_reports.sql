-- F17a-1 Custom reports (database).
--
--   custom_reports       a person's saved custom reports (built by the
--                        assistant in the report language, PROJECT_PLAN §6.6):
--                        own rows only, report readers only (admin, approver,
--                        auditor), audited (report.custom_saved / _changed /
--                        _deleted), deleted 60 days after the last change by a
--                        daily pg_cron job. The definition is checked by the
--                        app (Zod) — the database keeps it as a JSON object and
--                        limits its size. It holds no rows: the data is read
--                        again on every open ("data as of now").
--   report_access_held() every current holding (applications, equipment and
--                        access) with the person's employee id, so a custom
--                        report can ask "holds all / any / none of". Same
--                        rows and visibility as Access by application (RLS).
--   log_report_export()  also accepts the Excel format (xlsx, F17a-5).

-- ---------------------------------------------------------------------------
-- 1. Saved custom reports
-- ---------------------------------------------------------------------------
create table public.custom_reports (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default private.current_user_id()
    references public.app_users (clerk_user_id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 200),
  definition jsonb not null
    check (jsonb_typeof(definition) = 'object' and octet_length(definition::text) <= 50000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Server times (the AI tables' trigger: created_at kept, updated_at = now()).
create trigger custom_reports_timestamps before insert or update on public.custom_reports
  for each row execute function private.set_ai_timestamps();
create index custom_reports_user_idx on public.custom_reports (user_id, updated_at desc);
comment on table public.custom_reports is
  'A person''s custom reports made with the assistant (F17a). Only the maker sees them; deleted 60 days after the last change.';

alter table public.custom_reports enable row level security;
create policy "custom_reports: own, report readers" on public.custom_reports
  for all to authenticated
  using (user_id = private.current_user_id())
  with check (
    user_id = private.current_user_id()
    and private.is_active_user()
    and private.has_any_role(array['admin', 'approver', 'auditor']::public.app_role[])
  );
grant select, insert, update, delete on public.custom_reports to authenticated;

-- Every save, change and delete in the audit log (title and number of parts —
-- never the rows).
create function private.audit_custom_reports()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.custom_reports := case when tg_op = 'DELETE' then old else new end;
  v_parts integer := case when jsonb_typeof(v_row.definition -> 'parts') = 'array'
                          then jsonb_array_length(v_row.definition -> 'parts') else 0 end;
begin
  if tg_op = 'INSERT' then
    perform private.write_audit('report.custom_saved', 'custom_report', new.id::text,
      jsonb_build_object('title', new.title, 'parts', v_parts));
  elsif tg_op = 'UPDATE' then
    if new.title is distinct from old.title or new.definition is distinct from old.definition then
      perform private.write_audit('report.custom_changed', 'custom_report', new.id::text,
        jsonb_build_object('title', new.title, 'parts', v_parts));
    end if;
  else
    perform private.write_audit('report.custom_deleted', 'custom_report', old.id::text,
      jsonb_build_object('title', old.title, 'parts', v_parts));
  end if;
  return v_row;
end;
$$;
revoke all on function private.audit_custom_reports() from public;
create trigger custom_reports_audit after insert or update or delete on public.custom_reports
  for each row execute function private.audit_custom_reports();

-- ---------------------------------------------------------------------------
-- 2. 60 days: delete old custom reports every day (pg_cron)
-- ---------------------------------------------------------------------------
create function private.purge_old_custom_reports()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  delete from public.custom_reports where updated_at < now() - interval '60 days';
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
comment on function private.purge_old_custom_reports() is
  'Deletes custom reports not changed for more than 60 days (run daily by pg_cron).';
revoke all on function private.purge_old_custom_reports() from public;

select cron.schedule('purge-old-custom-reports', '20 2 * * *',
  $$select private.purge_old_custom_reports()$$);

-- ---------------------------------------------------------------------------
-- 3. Everything held today, with the employee id (data set "Access held")
-- ---------------------------------------------------------------------------
-- Invoker: the reader's own access (RLS) decides, exactly as for Access by
-- application. One call for all three kinds.
create function public.report_access_held(p_limit integer default 5000)
returns table (
  inventory_id uuid,
  kind public.inventory_kind,
  item_key text,
  name text,
  category_name text,
  permission text,
  asset_tag text,
  granted_at timestamptz,
  granted_ticket_id text,
  employee_id uuid,
  total_count bigint
)
language plpgsql
stable
set search_path = ''
as $$
begin
  perform private.require_report_reader();
  return query
  select h.inventory_id, k.kind, h.item_key, h.name, h.category_name, h.permission,
    h.asset_tag, h.granted_at, h.granted_ticket_id, h.employee_id,
    count(*) over ()
  from unnest(enum_range(null::public.inventory_kind)) as k (kind)
  cross join lateral private.access_held_rows(k.kind, null, null, null, null, null, null, null) h
  order by h.employee_id, k.kind, h.name, h.inventory_id
  limit least(greatest(coalesce(p_limit, 5000), 1), 20000);
end;
$$;
comment on function public.report_access_held(integer) is
  'Every application, device and access held today, with the employee id (custom reports, F17a). Report readers; RLS decides.';
revoke all on function public.report_access_held(integer) from public, anon;
grant execute on function public.report_access_held(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Exports: Excel too
-- ---------------------------------------------------------------------------
create or replace function public.log_report_export(
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
  if p_format is null or p_format not in ('csv', 'pdf', 'xlsx') then
    raise exception 'format must be csv, pdf or xlsx' using errcode = 'check_violation';
  end if;
  perform private.write_audit('report.exported', 'report', p_report,
    jsonb_build_object('format', p_format, 'rows', greatest(coalesce(p_rows, 0), 0),
      'filters', jsonb_strip_nulls(coalesce(p_filters, '{}'::jsonb))));
end;
$$;

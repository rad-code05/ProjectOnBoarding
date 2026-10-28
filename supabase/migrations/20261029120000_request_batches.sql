-- F17b-1 Batch requests (database).
--
--   request_batches       a person's batch: a list of joiners, leavers or role
--                         changes read from a file, a pasted list or the chat
--                         (design/batch-requests.md, D8). Own rows only, admin
--                         and requester; kept 7 days (pg_cron), then deleted —
--                         the drafts it created stay. Read-only once created.
--   request_batch_rows    one row per person (up to 50): what the grid shows
--                         and edits (`data`), the values the draft gets
--                         (`writes`, the same items as suggest_request_values),
--                         the app's checks (`problems`) and Include.
--   create_batch_drafts() Confirm: one draft per included row without
--                         problems, all or nothing. Each draft is made like the
--                         robot's single draft (ai_start_request) and its
--                         values go through the same checked path — suggested,
--                         then accepted at once (the same writes as typing).
--                         Values that belong to execution (removal method,
--                         mailbox) wait on the draft as suggestions. Checked
--                         again here: open requests with the same work email,
--                         duplicates in the batch, dates in the past.
--                         Audited source = ai.

-- ---------------------------------------------------------------------------
-- 1. Batches and their rows
-- ---------------------------------------------------------------------------
create table public.request_batches (
  id uuid primary key default gen_random_uuid(),
  created_by text not null default private.current_user_id()
    references public.app_users (clerk_user_id) on delete cascade,
  type public.request_type not null,
  title text not null check (length(trim(title)) between 1 and 200),
  source text not null check (source in ('file', 'paste', 'chat')),
  file_name text check (file_name is null or length(file_name) <= 200),
  -- "The same for everyone" (offboarding: SLA, cut-off time, method, mailbox).
  settings jsonb not null default '{}'::jsonb
    check (jsonb_typeof(settings) = 'object' and octet_length(settings::text) <= 5000),
  status text not null default 'open' check (status in ('open', 'created')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  confirmed_at timestamptz
);
create index request_batches_user_idx on public.request_batches (created_by, created_at desc);
comment on table public.request_batches is
  'A person''s batch of joiners, leavers or role changes (F17b). Only the maker sees it; deleted 7 days after it was made.';

create table public.request_batch_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.request_batches (id) on delete cascade,
  position smallint not null check (position between 1 and 50),
  included boolean not null default true,
  -- Offboarding / access change: the person (from what they hold today).
  employee_id uuid references public.employees (id) on delete set null,
  data jsonb not null default '{}'::jsonb
    check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 20000),
  writes jsonb not null default '[]'::jsonb
    check (jsonb_typeof(writes) = 'array' and jsonb_array_length(writes) <= 60),
  problems jsonb not null default '[]'::jsonb
    check (jsonb_typeof(problems) = 'array' and jsonb_array_length(problems) <= 30),
  request_id uuid references public.requests (id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (batch_id, position)
);
comment on table public.request_batch_rows is
  'One person of a batch (F17b): grid values, the draft''s values, the checks, Include; the draft once created.';

-- Server times.
create function private.set_batch_times()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and tg_table_name = 'request_batches' then
    new.created_at := now();
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.set_batch_times() from public;
create trigger request_batches_times before insert or update on public.request_batches
  for each row execute function private.set_batch_times();
create trigger request_batch_rows_times before insert or update on public.request_batch_rows
  for each row execute function private.set_batch_times();

-- Read-only once created; a batch becomes "created" (and a row gets its
-- draft) only inside create_batch_drafts().
create function private.guard_request_batches()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_creating boolean := coalesce(current_setting('app.batch_creating', true), '') = 'on';
begin
  if tg_op = 'UPDATE' then
    if old.status = 'created' then
      raise exception 'this batch was created already' using errcode = '42501';
    end if;
    if (new.status is distinct from old.status or new.confirmed_at is distinct from old.confirmed_at)
       and not v_creating then
      raise exception 'a batch is created only by Confirm' using errcode = '42501';
    end if;
    if new.type is distinct from old.type or new.created_by is distinct from old.created_by then
      raise exception 'the kind and maker of a batch never change' using errcode = '42501';
    end if;
  elsif new.status <> 'open' or new.confirmed_at is not null then
    raise exception 'a new batch starts open' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_request_batches() from public;
create trigger request_batches_guard before insert or update on public.request_batches
  for each row execute function private.guard_request_batches();

create function private.guard_request_batch_rows()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_creating boolean := coalesce(current_setting('app.batch_creating', true), '') = 'on';
  v_row public.request_batch_rows := case when tg_op = 'DELETE' then old else new end;
begin
  -- Called by a foreign key (the batch deleted, a draft or person gone).
  if pg_trigger_depth() > 1 then
    return v_row;
  end if;
  if not v_creating and exists (select 1 from public.request_batches b
                                where b.id = v_row.batch_id and b.status = 'created') then
    raise exception 'this batch was created already' using errcode = '42501';
  end if;
  if tg_op <> 'DELETE' and not v_creating
     and (case when tg_op = 'INSERT' then new.request_id is not null
               else new.request_id is distinct from old.request_id end) then
    raise exception 'a row gets its draft only by Confirm' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.batch_id <> old.batch_id then
    raise exception 'a row stays in its batch' using errcode = '42501';
  end if;
  return v_row;
end;
$$;
revoke all on function private.guard_request_batch_rows() from public;
create trigger request_batch_rows_guard before insert or update or delete on public.request_batch_rows
  for each row execute function private.guard_request_batch_rows();

-- Own batches only; admin and requester (the people who create requests).
alter table public.request_batches enable row level security;
create policy "request_batches: own, admin or requester" on public.request_batches
  for all to authenticated
  using (created_by = private.current_user_id())
  with check (
    created_by = private.current_user_id()
    and private.is_active_user()
    and private.has_any_role(array['admin', 'requester']::public.app_role[])
  );
grant select, insert, update, delete on public.request_batches to authenticated;

alter table public.request_batch_rows enable row level security;
create policy "request_batch_rows: with their own batch" on public.request_batch_rows
  for all to authenticated
  using (exists (select 1 from public.request_batches b
                 where b.id = batch_id and b.created_by = private.current_user_id()))
  with check (
    exists (select 1 from public.request_batches b
            where b.id = batch_id and b.created_by = private.current_user_id())
    and private.is_active_user()
    and private.has_any_role(array['admin', 'requester']::public.app_role[])
  );
grant select, insert, update, delete on public.request_batch_rows to authenticated;

-- Audit: made, created (Confirm) and discarded — the title, kind, source,
-- counts and tickets, never the rows' contents (the drafts are audited
-- themselves).
create function private.audit_request_batches()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform private.write_audit('batch.made', 'request_batch', new.id::text,
      jsonb_build_object('title', new.title, 'type', new.type, 'source', new.source,
                         'file_name', new.file_name));
  elsif tg_op = 'UPDATE' then
    if old.status = 'open' and new.status = 'created' then
      perform private.write_audit('batch.created', 'request_batch', new.id::text,
        jsonb_build_object('title', new.title, 'type', new.type,
          'created', (select count(*) from public.request_batch_rows r
                      where r.batch_id = new.id and r.request_id is not null),
          'left_out', (select count(*) from public.request_batch_rows r
                       where r.batch_id = new.id and r.request_id is null),
          'tickets', (select jsonb_agg(q.ticket_id order by r.position)
                      from public.request_batch_rows r join public.requests q on q.id = r.request_id
                      where r.batch_id = new.id)));
    end if;
  elsif old.status = 'open' and coalesce(current_setting('app.batch_purging', true), '') <> 'on' then
    perform private.write_audit('batch.discarded', 'request_batch', old.id::text,
      jsonb_build_object('title', old.title, 'type', old.type));
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
revoke all on function private.audit_request_batches() from public;
create trigger request_batches_audit after insert or update or delete on public.request_batches
  for each row execute function private.audit_request_batches();

-- ---------------------------------------------------------------------------
-- 2. 7 days: delete old batches every day (pg_cron) — the drafts stay
-- ---------------------------------------------------------------------------
create function private.purge_old_request_batches()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  -- Not "discarded" by anyone: the audit trigger stays quiet.
  perform set_config('app.batch_purging', 'on', true);
  delete from public.request_batches where created_at < now() - interval '7 days';
  get diagnostics v_n = row_count;
  perform set_config('app.batch_purging', '', true);
  return v_n;
end;
$$;
comment on function private.purge_old_request_batches() is
  'Deletes batches made more than 7 days ago (run daily by pg_cron); the drafts they created stay.';
revoke all on function private.purge_old_request_batches() from public;

select cron.schedule('purge-old-request-batches', '30 2 * * *',
  $$select private.purge_old_request_batches()$$);

-- ---------------------------------------------------------------------------
-- 3. Confirm: one draft per included row, all or nothing
-- ---------------------------------------------------------------------------
-- Invoker: every write is the person's own (RLS, the create functions' and
-- the item tables' checks). Any failing row raises — nothing is created.
create function public.create_batch_drafts(p_batch_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  b public.request_batches;
  r public.request_batch_rows;
  v_today date := (now() at time zone private.company_timezone())::date;
  v_request uuid;
  v_ticket text;
  v_writes jsonb;
  v_item jsonb;
  v_email text;
  v_emails text[] := array[]::text[];
  v_method text;
  v_created jsonb := '[]'::jsonb;
  s_id uuid;
begin
  if not (private.is_active_user()
          and private.has_any_role(array['admin', 'requester']::public.app_role[])) then
    raise exception 'only admins and requesters create requests' using errcode = '42501';
  end if;
  select * into b from public.request_batches where id = p_batch_id for update;
  if b.id is null then
    raise exception 'batch not found' using errcode = '22023';
  end if;
  if b.status <> 'open' then
    raise exception 'this batch was created already' using errcode = '22023';
  end if;
  if not exists (select 1 from public.request_batch_rows
                 where batch_id = b.id and included and problems = '[]'::jsonb) then
    raise exception 'no row is ready to create' using errcode = '22023';
  end if;

  perform set_config('app.audit_source', 'ai', true);
  perform set_config('app.batch_creating', 'on', true);

  for r in select * from public.request_batch_rows
           where batch_id = b.id order by position loop
    if not r.included or r.problems <> '[]'::jsonb then
      continue;
    end if;

    -- Checked again at Confirm (someone may have opened a request meanwhile).
    v_email := null;
    v_method := null;
    v_writes := '[]'::jsonb;
    for v_item in select * from jsonb_array_elements(r.writes) loop
      if v_item ->> 'kind' not in ('field', 'access', 'equipment', 'physical', 'held',
                                   'mailbox', 'removal_all') then
        raise exception 'row %: % is not part of a batch', r.position, coalesce(v_item ->> 'kind', '?')
          using errcode = '22023';
      end if;
      if v_item ->> 'kind' = 'field' and v_item ->> 'target' = 'work_email' then
        v_email := lower(trim(v_item ->> 'value'));
      end if;
      if v_item ->> 'kind' = 'field'
         and v_item ->> 'target' in ('effective_date', 'last_working_day')
         and (v_item ->> 'value') ~ '^\d{4}-\d{2}-\d{2}$'
         and (v_item ->> 'value')::date < v_today then
        raise exception 'row %: % is in the past — dates are never backdated',
          r.position, v_item ->> 'target' using errcode = '22023';
      end if;
      if v_item ->> 'kind' = 'removal_all' then
        v_method := v_item -> 'value' ->> 'method';
        if b.type <> 'offboarding' or v_method not in ('Delete', 'Suspend', 'Disable') then
          raise exception 'row %: the removal method is Delete, Suspend or Disable, on an offboarding',
            r.position using errcode = '22023';
        end if;
      else
        v_writes := v_writes || jsonb_build_array(v_item);
      end if;
    end loop;

    if b.type = 'onboarding' then
      if r.employee_id is not null then
        raise exception 'row %: an onboarding starts without a person', r.position using errcode = '22023';
      end if;
      if v_email is not null then
        if v_email = any (v_emails) then
          raise exception 'row %: % is twice in this batch', r.position, v_email using errcode = '23505';
        end if;
        if exists (select 1 from public.requests q
                   where lower(q.work_email) = v_email
                     and q.state not in ('closed', 'cancelled')) then
          raise exception 'row %: % already has an open request', r.position, v_email using errcode = '23505';
        end if;
        v_emails := array_append(v_emails, v_email);
      end if;
    elsif r.employee_id is null then
      raise exception 'row %: whose request is it? (no person)', r.position using errcode = '22023';
    end if;

    -- The draft, exactly like the robot's single draft.
    v_request := public.ai_start_request(b.type, r.employee_id);

    -- Removal method for every application to remove (waits for execution).
    if v_method is not null then
      v_writes := v_writes || coalesce((
        select jsonb_agg(jsonb_build_object('kind', 'removal', 'target', 'removal:' || a.id,
                                            'value', jsonb_build_object('method', v_method)))
          from public.request_access_items a where a.request_id = v_request), '[]'::jsonb);
    end if;

    if jsonb_array_length(v_writes) > 0 then
      perform public.suggest_request_values(v_request, v_writes);
      -- Written straight away (the person checked them in the grid) — the
      -- same writes as typing. Removal method and mailbox wait for execution.
      for s_id in select id from public.request_suggestions
                  where request_id = v_request and status = 'pending'
                    and kind not in ('removal', 'mailbox')
                  order by created_at, id loop
        perform public.accept_request_suggestion(s_id);
      end loop;
    end if;

    update public.request_batch_rows set request_id = v_request where id = r.id;
    select ticket_id into v_ticket from public.requests where id = v_request;
    v_created := v_created || jsonb_build_array(jsonb_build_object(
      'position', r.position, 'request_id', v_request, 'ticket_id', v_ticket));
  end loop;

  -- Audited by the batch's own trigger (batch.created: counts and tickets).
  update public.request_batches set status = 'created', confirmed_at = now() where id = b.id;
  perform set_config('app.batch_creating', '', true);
  return v_created;
end;
$$;
revoke all on function public.create_batch_drafts(uuid) from public;
grant execute on function public.create_batch_drafts(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. The audit log files batch.* under Requests
-- ---------------------------------------------------------------------------
-- Replaced from its latest definition (20261015130000_reports.sql).
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
      or p_action like 'inventory.%' or p_action like 'batch.%' then 'requests'
    when p_action like 'session.%' or p_action like 'account.%' then 'accounts'
    else 'admin' -- catalog.*, settings.*, user.*, role.*, dev.*
  end
$$;

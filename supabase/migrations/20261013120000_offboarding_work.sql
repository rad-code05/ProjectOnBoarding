-- F09b-2 — Doing the offboarding: removal method + tick per row, equipment
-- return, the mailbox choice, SLA met / missed, Review & sign checks, and the
-- snapshot Moises and the PDF see.
--
-- Decided 2026-10-12:
--   * Each application row gets its removal method — Delete, Suspend or
--     Disable — chosen every time (no default per app).
--   * Each removal (application or access) is ticked when done; the time and
--     person are recorded by the database. MET / MISSED comes from the LAST
--     tick versus the deadline (sla_due_at, F09b-1) — never typed. Missed →
--     a reason is required before Review & sign.
--   * Equipment is outside the SLA: Return pending / Received / Not returned
--     (+ reason). Review & sign needs every device Received or Not returned.
--   * Mailbox: required choice "converted to a shared mailbox" or "no mailbox
--     to convert" (Office 365: block sign-in + convert to shared).
--   * An offboarding needs at least one application or access to remove.
-- Onboarding is unchanged: its snapshot (and fingerprint) stays the same.

-- ---------------------------------------------------------------------------
-- 1. Columns (changed only through the functions below)
-- ---------------------------------------------------------------------------
alter table public.request_access_items
  add column removal_method text check (removal_method in ('Delete', 'Suspend', 'Disable')),
  add column done_at timestamptz,
  add column done_by text references public.app_users (clerk_user_id);

alter table public.request_physical_access_items
  add column done_at timestamptz,
  add column done_by text references public.app_users (clerk_user_id);

alter table public.request_equipment_items
  add column return_status text check (return_status in ('pending', 'received', 'not_returned')),
  add column return_reason text check (length(return_reason) <= 500),
  add column return_recorded_at timestamptz,
  add column return_recorded_by text references public.app_users (clerk_user_id),
  add constraint request_equipment_items_not_returned_reason
    check (return_status is distinct from 'not_returned' or return_reason is not null);

alter table public.requests
  add column mailbox_handling text check (mailbox_handling in ('converted_shared', 'no_mailbox')),
  add column mailbox_recorded_at timestamptz,
  add column mailbox_recorded_by text references public.app_users (clerk_user_id),
  add column sla_missed_reason text check (length(sla_missed_reason) <= 1000),
  add constraint requests_offboarding_work check (
    type = 'offboarding' or (mailbox_handling is null and sla_missed_reason is null)
  );

comment on column public.request_access_items.done_at is 'Offboarding: when the removal was ticked (server time), by done_by. Set only by set_removal().';
comment on column public.request_equipment_items.return_status is 'Offboarding: pending / received / not_returned (+ reason). Set only by set_equipment_return().';
comment on column public.requests.mailbox_handling is 'Offboarding: converted_shared / no_mailbox. Set only by set_mailbox_handling().';

-- The work columns change only inside the functions (flag app.removal_work).
create function private.removal_work_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cols text[] := case tg_table_name
    when 'request_access_items' then array['removal_method', 'done_at', 'done_by']
    when 'request_physical_access_items' then array['done_at', 'done_by']
    when 'request_equipment_items' then array['return_status', 'return_reason', 'return_recorded_at', 'return_recorded_by']
    else array['mailbox_handling', 'mailbox_recorded_at', 'mailbox_recorded_by'] end;
begin
  if coalesce(current_setting('app.removal_work', true), '') = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new := jsonb_populate_record(new, (select jsonb_object_agg(c, null) from unnest(v_cols) c));
    -- Nested: PL/pgSQL does not short-circuit, and requests has no request_id.
    if tg_table_name = 'request_equipment_items' then
      if private.request_is_offboarding(new.request_id) then
        new.return_status := 'pending';
      end if;
    end if;
  elsif exists (select 1 from unnest(v_cols) c where to_jsonb(new) -> c is distinct from to_jsonb(old) -> c) then
    raise exception 'removal ticks, returns and the mailbox change only through their functions'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger request_access_items_work_guard before insert or update on public.request_access_items
for each row execute function private.removal_work_guard();
create trigger request_physical_access_items_work_guard before insert or update on public.request_physical_access_items
for each row execute function private.removal_work_guard();
create trigger request_equipment_items_work_guard before insert or update on public.request_equipment_items
for each row execute function private.removal_work_guard();
create trigger requests_d_work_guard before insert or update on public.requests
for each row execute function private.removal_work_guard();

-- ---------------------------------------------------------------------------
-- 2. Recording the work
-- ---------------------------------------------------------------------------
create function private.require_offboarding_worker()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if private.current_user_id() is null or not private.is_active_user()
     or not private.has_any_role(array['admin', 'requester', 'it_operator']::public.app_role[]) then
    raise exception 'only the IT side records offboarding work' using errcode = 'insufficient_privilege';
  end if;
end;
$$;

-- The offboarding a row belongs to, locked, if the caller may work on it now.
create function private.lock_offboarding_for_work(p_request_id uuid)
returns public.requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.requests;
begin
  perform private.require_offboarding_worker();
  select * into v_request from public.requests where id = p_request_id for update;
  if not found or v_request.type <> 'offboarding' then
    raise exception 'offboarding not found' using errcode = 'no_data_found';
  end if;
  if v_request.state not in ('in_execution', 'returned') then
    raise exception 'removals are recorded while the offboarding is in execution' using errcode = 'check_violation';
  end if;
  return v_request;
end;
$$;

-- p_kind 'application' | 'access'; p_done null = keep; p_method only for applications.
create function public.set_removal(p_kind text, p_item_id uuid, p_done boolean default null, p_method text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user text := private.current_user_id();
  v_request uuid;
  v_name text;
  v_method text;
  v_done_at timestamptz;
  v_new_method text;
  v_new_done boolean;
begin
  perform private.require_offboarding_worker();
  if p_kind = 'application' then
    select request_id, app_name, removal_method, done_at into v_request, v_name, v_method, v_done_at
    from public.request_access_items where id = p_item_id;
  elsif p_kind = 'access' then
    select request_id, type_name, null, done_at into v_request, v_name, v_method, v_done_at
    from public.request_physical_access_items where id = p_item_id;
  else
    raise exception 'kind must be application or access' using errcode = 'check_violation';
  end if;
  if v_request is null then
    raise exception 'row not found' using errcode = 'no_data_found';
  end if;
  perform private.lock_offboarding_for_work(v_request);

  v_new_done := coalesce(p_done, v_done_at is not null);
  v_new_method := v_method;
  if p_kind = 'application' and p_method is not null then
    if p_method not in ('Delete', 'Suspend', 'Disable') then
      raise exception 'choose Delete, Suspend or Disable' using errcode = 'check_violation';
    end if;
    if v_done_at is not null and p_method is distinct from v_method and p_done is not false then
      raise exception 'untick % before changing how it was removed', v_name using errcode = 'check_violation';
    end if;
    v_new_method := p_method;
  end if;
  if p_kind = 'application' and v_new_done and v_new_method is null then
    raise exception 'choose Delete, Suspend or Disable for % first', v_name using errcode = 'check_violation';
  end if;

  perform set_config('app.removal_work', 'on', true);
  if p_kind = 'application' then
    update public.request_access_items
    set removal_method = v_new_method,
        done_at = case when v_new_done then coalesce(done_at, now()) end,
        done_by = case when v_new_done then coalesce(done_by, v_user) end
    where id = p_item_id;
  else
    update public.request_physical_access_items
    set done_at = case when v_new_done then coalesce(done_at, now()) end,
        done_by = case when v_new_done then coalesce(done_by, v_user) end
    where id = p_item_id;
  end if;
  perform set_config('app.removal_work', 'off', true);

  if v_new_done is distinct from (v_done_at is not null) or v_new_method is distinct from v_method then
    perform private.write_audit(
      case when v_new_done and v_done_at is null then 'request.removal_done'
           when not v_new_done and v_done_at is not null then 'request.removal_undone'
           else 'request.removal_method_set' end,
      'request', v_request::text,
      jsonb_build_object('kind', p_kind, 'item_id', p_item_id, 'name', v_name, 'method', v_new_method));
  end if;
end;
$$;
comment on function public.set_removal(text, uuid, boolean, text) is 'Offboarding: choose an application''s removal method and/or tick / untick a removal (server time); audited.';

create function public.set_equipment_return(p_item_id uuid, p_status text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user text := private.current_user_id();
  v_row public.request_equipment_items;
  v_reason text := nullif(trim(p_reason), '');
begin
  perform private.require_offboarding_worker();
  select * into v_row from public.request_equipment_items where id = p_item_id;
  if not found then
    raise exception 'row not found' using errcode = 'no_data_found';
  end if;
  perform private.lock_offboarding_for_work(v_row.request_id);
  if p_status is null or p_status not in ('pending', 'received', 'not_returned') then
    raise exception 'status must be pending, received or not_returned' using errcode = 'check_violation';
  end if;
  if p_status = 'not_returned' and v_reason is null then
    raise exception 'say why it was not returned' using errcode = 'check_violation';
  end if;

  perform set_config('app.removal_work', 'on', true);
  update public.request_equipment_items
  set return_status = p_status,
      return_reason = case when p_status = 'not_returned' then v_reason end,
      return_recorded_at = case when p_status = 'pending' then null else now() end,
      return_recorded_by = case when p_status = 'pending' then null else v_user end
  where id = p_item_id;
  perform set_config('app.removal_work', 'off', true);

  perform private.write_audit('request.equipment_return_set', 'request', v_row.request_id::text,
    jsonb_build_object('item_id', p_item_id, 'type', v_row.type_name, 'asset_tag', v_row.asset_tag,
      'before', v_row.return_status, 'after', p_status, 'reason', v_reason));
end;
$$;
comment on function public.set_equipment_return(uuid, text, text) is 'Offboarding: a device is pending / received / not returned (reason required); time recorded; audited.';

create function public.set_mailbox_handling(p_request_id uuid, p_value text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.requests := private.lock_offboarding_for_work(p_request_id);
begin
  if p_value is not null and p_value not in ('converted_shared', 'no_mailbox') then
    raise exception 'mailbox must be converted_shared or no_mailbox' using errcode = 'check_violation';
  end if;
  perform set_config('app.removal_work', 'on', true);
  update public.requests
  set mailbox_handling = p_value,
      mailbox_recorded_at = case when p_value is null then null else now() end,
      mailbox_recorded_by = case when p_value is null then null else private.current_user_id() end
  where id = p_request_id;
  perform set_config('app.removal_work', 'off', true);
  perform private.write_audit('request.mailbox_set', 'request', p_request_id::text,
    jsonb_build_object('ticket_id', v_request.ticket_id, 'before', v_request.mailbox_handling, 'after', p_value));
end;
$$;
comment on function public.set_mailbox_handling(uuid, text) is 'Offboarding: mailbox converted to shared / no mailbox to convert (or cleared); time recorded; audited.';

-- ---------------------------------------------------------------------------
-- 3. SLA met / missed (from the ticks, never typed)
-- ---------------------------------------------------------------------------
create function private.request_sla(p_request_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with rows as (
    select done_at from public.request_access_items where request_id = p_request_id
    union all
    select done_at from public.request_physical_access_items where request_id = p_request_id
  ), t as (
    select count(*)::int as total, count(done_at)::int as done, max(done_at) as last_done from rows
  )
  select jsonb_build_object(
    'due_at', private.utc_text(r.sla_due_at),
    'total', t.total,
    'done', t.done,
    -- The time of the last removal, once every removal is ticked.
    'removed_at', case when t.total > 0 and t.done = t.total then private.utc_text(t.last_done) end,
    'met', case
      when r.sla_due_at is null or t.total = 0 then null
      when t.done = t.total then t.last_done <= r.sla_due_at
      when now() > r.sla_due_at then false
    end
  )
  from public.requests r, t
  where r.id = p_request_id and r.type = 'offboarding';
$$;

create function public.request_sla(p_request_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.request_visible(p_request_id) then
    raise exception 'request not found' using errcode = 'no_data_found';
  end if;
  return private.request_sla(p_request_id);
end;
$$;
comment on function public.request_sla(uuid) is 'Offboarding SLA: deadline, removals done / total, time of the last removal, met (true / false / null = not decided yet).';

-- ---------------------------------------------------------------------------
-- 4. Review & sign: offboarding blockers join the "missing" list
-- ---------------------------------------------------------------------------
create function private.offboarding_blockers(p_request_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_request public.requests;
  v_sla jsonb;
  v_out text[] := '{}'::text[];
  v_apps int; v_apps_done int; v_no_method int;
  v_access int; v_access_done int;
  v_kit int; v_kit_settled int;
begin
  select * into v_request from public.requests where id = p_request_id;
  if not found or v_request.type <> 'offboarding' then
    return v_out;
  end if;
  select count(*), count(done_at), count(*) filter (where removal_method is null)
  into v_apps, v_apps_done, v_no_method
  from public.request_access_items where request_id = p_request_id;
  select count(*), count(done_at) into v_access, v_access_done
  from public.request_physical_access_items where request_id = p_request_id;
  select count(*), count(*) filter (where return_status in ('received', 'not_returned'))
  into v_kit, v_kit_settled
  from public.request_equipment_items where request_id = p_request_id;

  if v_request.sla_due_at is null then
    v_out := array_append(v_out, 'Access removal SLA (timeline and cut-off)');
  end if;
  if v_apps + v_access = 0 then
    v_out := array_append(v_out, 'At least one application or access to remove');
  end if;
  if v_no_method > 0 then
    v_out := array_append(v_out, format('Removal method (Delete, Suspend or Disable) for %s application(s)', v_no_method));
  end if;
  if v_apps_done < v_apps then
    v_out := array_append(v_out, format('Applications removed (%s of %s)', v_apps_done, v_apps));
  end if;
  if v_access_done < v_access then
    v_out := array_append(v_out, format('Access disabled or removed (%s of %s)', v_access_done, v_access));
  end if;
  if v_kit_settled < v_kit then
    v_out := array_append(v_out, format('Equipment received or marked not returned (%s of %s)', v_kit_settled, v_kit));
  end if;
  if v_request.handover_to is null then
    v_out := array_append(v_out, 'Data & mailbox go to');
  end if;
  if v_request.mailbox_handling is null then
    v_out := array_append(v_out, 'Mailbox: converted to a shared mailbox, or no mailbox to convert');
  end if;
  v_sla := private.request_sla(p_request_id);
  if (v_sla ->> 'met')::boolean is false and nullif(trim(v_request.sla_missed_reason), '') is null then
    v_out := array_append(v_out, 'Reason the access removal SLA was missed');
  end if;
  return v_out;
end;
$$;

create or replace function private.missing_required_fields(p_request_id uuid)
returns text[]
language sql
stable
set search_path = ''
as $$
  select coalesce(array_agg(f.label order by f.section, f.sort_order), '{}')
         || private.offboarding_blockers(p_request_id)
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
            else f.key end
        end), '') is null;
$$;

-- ---------------------------------------------------------------------------
-- 5. The snapshot: offboarding facts (onboarding snapshots unchanged)
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
    ),
    'access', coalesce((
      select jsonb_agg(jsonb_build_object(
        'category', a.category_name, 'app', a.app_name, 'action', a.action,
        'permission', a.permission, 'notes', a.notes)
        || case when r.type = 'offboarding' then jsonb_build_object(
             'removal_method', a.removal_method, 'done_at', private.utc_text(a.done_at),
             'done_by_name', private.user_name(a.done_by)) else '{}'::jsonb end
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
  from public.requests r
  join public.form_versions fv on fv.id = r.form_version_id
  left join public.departments d on d.id = r.department_id
  where r.id = p_request_id;
$$;

-- ---------------------------------------------------------------------------
-- 6. Grants
-- ---------------------------------------------------------------------------
revoke all on function private.removal_work_guard() from public;
revoke all on function private.require_offboarding_worker() from public;
revoke all on function private.lock_offboarding_for_work(uuid) from public;
revoke all on function private.request_sla(uuid) from public;
revoke all on function private.offboarding_blockers(uuid) from public;
revoke all on function public.set_removal(text, uuid, boolean, text) from public, anon;
revoke all on function public.set_equipment_return(uuid, text, text) from public, anon;
revoke all on function public.set_mailbox_handling(uuid, text) from public, anon;
revoke all on function public.request_sla(uuid) from public, anon;
grant execute on function public.set_removal(text, uuid, boolean, text) to authenticated;
grant execute on function public.set_equipment_return(uuid, text, text) to authenticated;
grant execute on function public.set_mailbox_handling(uuid, text) to authenticated;
grant execute on function public.request_sla(uuid) to authenticated;

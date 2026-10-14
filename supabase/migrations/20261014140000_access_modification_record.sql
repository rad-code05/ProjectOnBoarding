-- F10a-2 — Access modification on the signed record (boards approved 2026-10-14).
--
-- * Closing: a returned device that points to the inventory ends exactly that
--   device (two laptops of the same type without asset tags no longer guess).
-- * Snapshot (what Raju signs and Moises confirms, then the PDF): each line
--   about something held says what the person HAD; an access change also
--   freezes section 2 as it was ("previous") and everything KEPT, so the
--   record shows the person's whole access after the change. Keys are only
--   added for access changes / linked lines — older snapshots are unchanged.
--   If the inventory changes after signing, confirming is refused (data
--   changed since review) and Raju signs again.
-- * Review & sign: an access change needs at least one line in sections 5–7.

-- ---------------------------------------------------------------------------
-- 1. Inventory at closing (as in 20261013130000_relaxed_signing.sql; only the
--    device match changed)
-- ---------------------------------------------------------------------------
create or replace function private.apply_request_to_inventory(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.requests;
  v_at timestamptz;
  v_item record;
  v_target uuid;
  v_n integer;
  v_added integer := 0;
  v_ended integer := 0;
begin
  select * into v_request from public.requests where id = p_request_id;
  if not found or v_request.employee_id is null then
    return jsonb_build_object('added', 0, 'ended', 0);
  end if;
  v_at := coalesce(v_request.closed_at, now());

  -- Applications: any line ends what is held for that app; hold actions add the new row.
  for v_item in
    select * from public.request_access_items where request_id = p_request_id order by created_at, id
  loop
    update public.employee_access_inventory i
    set ended_at = v_at, ended_request_id = p_request_id,
        end_reason = case when v_item.action in ('Grant', 'Modify', 'Enroll') then 'replaced' else 'removed' end
    where i.employee_id = v_request.employee_id and i.kind = 'application' and i.ended_at is null
      and case when v_item.app_id is not null then i.app_id = v_item.app_id
               else i.app_id is null and lower(i.name) = lower(v_item.app_name) end;
    get diagnostics v_n = row_count;
    v_ended := v_ended + v_n;
    if v_item.action in ('Grant', 'Modify', 'Enroll') then
      insert into public.employee_access_inventory
        (employee_id, kind, app_id, name, category_name, permission, granted_request_id, granted_at)
      values (v_request.employee_id, 'application', v_item.app_id, v_item.app_name, v_item.category_name,
        v_item.permission, p_request_id, v_at);
      v_added := v_added + 1;
    end if;
  end loop;

  -- Equipment: Issue adds a device; Return ends the matching one (the linked
  -- device on an access change, else same asset tag, else the oldest of that type).
  for v_item in
    select * from public.request_equipment_items where request_id = p_request_id order by created_at, id
  loop
    if v_item.action = 'Issue' then
      insert into public.employee_access_inventory
        (employee_id, kind, equipment_type_id, name, description, asset_tag, granted_request_id, granted_at)
      values (v_request.employee_id, 'equipment', v_item.type_id, v_item.type_name, v_item.description,
        v_item.asset_tag, p_request_id, v_at);
      v_added := v_added + 1;
    elsif v_item.return_status is distinct from 'pending' then
      -- Received / not returned (or a Return on another request type) ends it;
      -- an offboarding device still "Return pending" stays held (2026-10-13).
      select i.id into v_target
      from public.employee_access_inventory i
      where i.employee_id = v_request.employee_id and i.kind = 'equipment' and i.ended_at is null
        and i.equipment_type_id = v_item.type_id
        and (v_item.asset_tag is null or i.asset_tag is not distinct from v_item.asset_tag)
        and (v_item.inventory_id is null or i.id = v_item.inventory_id) -- access change: that exact device
      order by i.granted_at, i.id
      limit 1;
      if v_target is not null then
        update public.employee_access_inventory
        set ended_at = v_at, ended_request_id = p_request_id, end_reason = 'removed'
        where id = v_target;
        v_ended := v_ended + 1;
      end if;
    end if;
  end loop;

  -- Physical & logical access: Grant / Modify replace, Disable / Remove end.
  for v_item in
    select * from public.request_physical_access_items where request_id = p_request_id order by created_at, id
  loop
    update public.employee_access_inventory i
    set ended_at = v_at, ended_request_id = p_request_id,
        end_reason = case when v_item.action in ('Grant', 'Modify') then 'replaced' else 'removed' end
    where i.employee_id = v_request.employee_id and i.kind = 'access' and i.ended_at is null
      and i.access_type_id = v_item.type_id;
    get diagnostics v_n = row_count;
    v_ended := v_ended + v_n;
    if v_item.action in ('Grant', 'Modify') then
      insert into public.employee_access_inventory
        (employee_id, kind, access_type_id, name, permission, granted_request_id, granted_at)
      values (v_request.employee_id, 'access', v_item.type_id, v_item.type_name, v_item.scope,
        p_request_id, v_at);
      v_added := v_added + 1;
    end if;
  end loop;

  return jsonb_build_object('added', v_added, 'ended', v_ended);
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Snapshot (as in 20261013120000_offboarding_work.sql; "had" on linked
--    lines and the access_modification block added)
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
           from public.requests p
           left join public.departments pd on pd.id = p.department_id
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
  where r.id = p_request_id;
$$;

-- ---------------------------------------------------------------------------
-- 3. Nothing to change = nothing to sign
-- ---------------------------------------------------------------------------
create function private.access_change_blockers(p_request_id uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select case when r.type = 'access_modification'
              and not exists (select 1 from public.request_access_items where request_id = r.id)
              and not exists (select 1 from public.request_equipment_items where request_id = r.id)
              and not exists (select 1 from public.request_physical_access_items where request_id = r.id)
         then array['At least one change: an application, device or access to change, remove or add']
         else '{}'::text[] end
  from public.requests r
  where r.id = p_request_id;
$$;
comment on function private.access_change_blockers(uuid) is 'Access change: what still blocks Review & sign (at least one line in sections 5–7).';

-- As in 20261013120000_offboarding_work.sql, plus the access-change line.
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
            else f.key end
        end), '') is null;
$$;

revoke all on function private.access_change_blockers(uuid) from public;

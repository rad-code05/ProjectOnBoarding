-- Relaxed signing rules (asked by Raju, 2026-10-13).
--
-- * Section 9: an incomplete checklist no longer blocks Review & sign (any
--   request type). It stays visible: Review & sign warns, Moises sees the
--   unticked items in red, the PDF prints "No" for each.
-- * Offboarding: a device still "Return pending" no longer blocks Review &
--   sign. It stays visible (warning, "Return pending" on the record and the
--   PDF), and when the offboarding closes the device STAYS in the person's
--   access inventory (not recorded as returned), so a later request pre-fills
--   it again.
-- Everything else is unchanged; each function below is its current
-- definition with only that rule removed or changed.

-- 1. Workflow: no checklist rule on the way to Awaiting confirmation.
create or replace function public.transition_request(
  p_request_id uuid,
  p_to public.request_state,
  p_reason text default null
)
returns public.request_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user text := private.current_user_id();
  v_request public.requests;
  v_reason text := nullif(trim(p_reason), '');
  v_it_side boolean := private.has_any_role(array['admin', 'requester', 'it_operator']::public.app_role[]);
  v_executor boolean := private.has_any_role(array['admin', 'it_operator']::public.app_role[]);
  v_cancels boolean := private.has_any_role(array['admin', 'requester']::public.app_role[]);
  v_approver boolean := private.has_any_role(array['approver']::public.app_role[]);
  v_executed_by text;
begin
  if v_user is null or not private.is_active_user() then
    raise exception 'sign in first' using errcode = 'insufficient_privilege';
  end if;

  select * into v_request from public.requests where id = p_request_id for update;
  if not found then
    raise exception 'request not found' using errcode = 'no_data_found';
  end if;

  case
    when v_request.state = 'draft' and p_to = 'in_execution' then
      if not v_it_side then
        raise exception 'only the IT side starts execution' using errcode = 'insufficient_privilege';
      end if;

    when v_request.state in ('in_execution', 'returned') and p_to = 'pending_confirmation' then
      if coalesce(current_setting('app.request_signing', true), 'off') <> 'on' then
        raise exception 'send it for confirmation with Review & sign' using errcode = 'insufficient_privilege';
      end if;
      if not v_executor then
        raise exception 'only an IT operator sends a request for confirmation' using errcode = 'insufficient_privilege';
      end if;

    when v_request.state = 'pending_confirmation' and p_to in ('closed', 'returned') then
      if coalesce(current_setting(
           case when p_to = 'closed' then 'app.request_confirming' else 'app.request_returning' end, true), 'off') <> 'on' then
        raise exception 'confirm or return it with Confirm & sign' using errcode = 'insufficient_privilege';
      end if;
      if not v_approver then
        raise exception 'only an approver confirms or returns a request' using errcode = 'insufficient_privilege';
      end if;
      select c.executed_by into v_executed_by from public.execution_confirmations c where c.request_id = p_request_id;
      if p_to = 'closed' and v_user in (v_request.created_by, v_executed_by) then
        raise exception 'nobody confirms their own request' using errcode = 'insufficient_privilege';
      end if;
      if p_to = 'returned' and v_reason is null then
        raise exception 'say what needs fixing' using errcode = 'check_violation';
      end if;

    when v_request.state in ('draft', 'in_execution', 'pending_confirmation', 'returned') and p_to = 'cancelled' then
      if not v_cancels then
        raise exception 'only Raju cancels a request' using errcode = 'insufficient_privilege';
      end if;
      if v_reason is null then
        raise exception 'a reason is required to cancel' using errcode = 'check_violation';
      end if;

    else
      raise exception 'a request cannot go from % to %', v_request.state, p_to using errcode = 'check_violation';
  end case;

  perform set_config('app.request_transition', 'on', true);
  update public.requests set
    state = p_to,
    state_changed_at = now(),
    execution_started_at = case when p_to = 'in_execution' then now() else execution_started_at end,
    closed_at = case when p_to = 'closed' then now() else closed_at end,
    cancelled_at = case when p_to = 'cancelled' then now() else cancelled_at end,
    cancelled_by = case when p_to = 'cancelled' then v_user else cancelled_by end,
    cancel_reason = case when p_to = 'cancelled' then v_reason else cancel_reason end,
    return_reason = case when p_to = 'returned' then v_reason else return_reason end
  where id = p_request_id;
  perform set_config('app.request_transition', 'off', true);

  perform private.write_audit('request.state_changed', 'request', p_request_id::text,
    jsonb_build_object('ticket_id', v_request.ticket_id, 'from', v_request.state, 'to', p_to, 'reason', v_reason));
  return p_to;
end;
$$;

-- 2. Review & sign: no checklist rule.
create or replace function public.sign_request(p_request_id uuid, p_reviewed jsonb, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user text := private.require_signer();
  v_request public.requests;
  v_note text := nullif(trim(p_note), '');
  v_missing text[];
  v_asset uuid;
  v_data jsonb;
  v_hash text;
  v_snapshot uuid;
  v_signature uuid;
begin
  select * into v_request from public.requests where id = p_request_id for update;
  if not found then
    raise exception 'request not found' using errcode = 'no_data_found';
  end if;
  if v_request.state not in ('in_execution', 'returned') then
    raise exception 'only a request in execution can be signed' using errcode = 'check_violation';
  end if;
  if v_note is not null and v_request.state <> 'returned' then
    raise exception 'a note for the approver is only for a returned request' using errcode = 'check_violation';
  end if;
  v_missing := private.missing_required_fields(p_request_id);
  if cardinality(v_missing) > 0 then
    raise exception 'required fields are empty: %', array_to_string(v_missing, ', ')
      using errcode = 'check_violation';
  end if;
  select id into v_asset from public.signature_assets where user_id = v_user and is_active;
  if v_asset is null then
    raise exception 'add your signature or initials in My profile first' using errcode = 'check_violation';
  end if;

  v_data := private.request_snapshot_data(p_request_id);
  if p_reviewed is distinct from v_data then
    raise exception 'the request changed while you were reviewing it — review it again'
      using errcode = 'serialization_failure';
  end if;
  v_hash := private.snapshot_sha256(v_data);

  insert into public.request_snapshots (request_id, kind, data, sha256, created_by)
  values (p_request_id, 'it_signature', v_data, v_hash, v_user)
  returning id into v_snapshot;

  -- Signing again after a return replaces any earlier IT signature.
  perform set_config('app.signature_clear', 'on', true);
  update public.signatures
  set cleared_at = now(), cleared_reason = 'Signed again after the request was returned'
  where request_id = p_request_id and section = 'it_execution' and cleared_at is null;
  perform set_config('app.signature_clear', 'off', true);

  insert into public.signatures
    (request_id, section, signer_id, signer_role, signature_asset_id, form_version_id, snapshot_id, note)
  values (
    p_request_id, 'it_execution', v_user,
    case when private.has_any_role(array['it_operator']::public.app_role[])
      then 'it_operator' else 'admin' end::public.app_role,
    v_asset, v_request.form_version_id, v_snapshot, v_note)
  returning id into v_signature;

  perform set_config('app.request_signing', 'on', true);
  perform public.transition_request(p_request_id, 'pending_confirmation');
  perform set_config('app.request_signing', 'off', true);

  perform private.write_audit('request.signed', 'request', p_request_id::text,
    jsonb_build_object('ticket_id', v_request.ticket_id, 'section', 'it_execution',
      'signature_id', v_signature, 'snapshot_id', v_snapshot, 'snapshot_sha256', v_hash,
      'note', v_note));
  return v_signature;
end;
$$;
comment on function public.sign_request(uuid, jsonb, text) is 'Raju''s Review & sign: checks (section 9 and returns no longer block — 2026-10-13), frozen snapshot + SHA-256, signature with server time (+ note after a return), → pending_confirmation, audit.';

-- 3. Offboarding blockers: equipment no longer listed.
create or replace function private.offboarding_blockers(p_request_id uuid)
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

-- 4. Inventory at closing: a pending device stays held.
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

  -- Equipment: Issue adds a device; Return ends the matching one (same asset tag,
  -- else the oldest of that type still held).
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

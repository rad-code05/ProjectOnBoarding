-- F10d-1 — The approver confirms exactly what the IT side signed (Raju,
-- 2026-10-14). Until now confirm_request() compared the data only with the
-- approver's own review. An access change freezes what the person keeps, so
-- if another of their requests closed after Raju's Review & sign, the two
-- signatures could cover different records. Now confirming is refused when
-- the request no longer matches the IT signature's snapshot; the approver
-- returns it and Raju signs again. Applies to every request type.
--
-- confirm_request() as in 20261009160000_approvals.sql; only the check added.
create or replace function public.confirm_request(p_request_id uuid, p_reviewed jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user text := private.require_approver();
  v_request public.requests;
  v_executed_by text;
  v_it_signer text;
  v_asset uuid;
  v_data jsonb;
  v_signed jsonb;
  v_hash text;
  v_snapshot uuid;
  v_signature uuid;
begin
  select * into v_request from public.requests where id = p_request_id for update;
  if not found then
    raise exception 'request not found' using errcode = 'no_data_found';
  end if;
  -- Also how "the first approver to confirm closes it" holds: the second finds it closed.
  if v_request.state <> 'pending_confirmation' then
    raise exception 'this request is not awaiting confirmation' using errcode = 'check_violation';
  end if;
  select c.executed_by into v_executed_by from public.execution_confirmations c where c.request_id = p_request_id;
  select s.signer_id into v_it_signer from public.signatures s
  where s.request_id = p_request_id and s.section = 'it_execution' and s.cleared_at is null;
  if v_user = v_request.created_by or v_user = v_executed_by or v_user = v_it_signer then
    raise exception 'nobody confirms their own request' using errcode = 'insufficient_privilege';
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
  -- Both signatures cover the same record: the IT side signed this data too.
  select rs.data into v_signed
  from public.signatures s
  join public.request_snapshots rs on rs.id = s.snapshot_id
  where s.request_id = p_request_id and s.section = 'it_execution' and s.cleared_at is null;
  if v_signed is distinct from v_data then
    raise exception 'the request changed after it was signed for IT — return it so it can be signed again'
      using errcode = 'check_violation';
  end if;
  v_hash := private.snapshot_sha256(v_data);

  insert into public.request_snapshots (request_id, kind, data, sha256, created_by)
  values (p_request_id, 'approval', v_data, v_hash, v_user)
  returning id into v_snapshot;

  insert into public.signatures
    (request_id, section, signer_id, signer_role, signature_asset_id, form_version_id, snapshot_id)
  values (p_request_id, 'final_confirmation', v_user, 'approver', v_asset, v_request.form_version_id, v_snapshot)
  returning id into v_signature;

  insert into public.approvals (request_id, decision, decided_by, signature_id, snapshot_id)
  values (p_request_id, 'confirmed', v_user, v_signature, v_snapshot);

  perform set_config('app.request_confirming', 'on', true);
  perform public.transition_request(p_request_id, 'closed');
  perform set_config('app.request_confirming', 'off', true);

  perform private.write_audit('request.confirmed', 'request', p_request_id::text,
    jsonb_build_object('ticket_id', v_request.ticket_id, 'signature_id', v_signature,
      'snapshot_id', v_snapshot, 'snapshot_sha256', v_hash));
  return v_signature;
end;
$$;

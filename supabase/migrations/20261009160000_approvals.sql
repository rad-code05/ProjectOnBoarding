-- F07a: Approvals (Moises) — confirm & sign, or return to Raju.
--
-- confirm_request(): an approver who did not create, execute or sign the
--   request confirms the snapshot he reviewed; his signature fills sections
--   3, 10 and the approver half of 11; the request closes. Every approver sees
--   the queue; the first to confirm closes it (row lock + state check).
-- return_request(): an approver returns it with a required comment and the
--   sections to fix (whole sections, decided 2026-10-09); Raju's signature is
--   cleared (kept, with the reason) and sections 1–9 open again.
-- sign_request(): Raju may add one note for the approver when he signs again
--   after a return (one note per round, decided 2026-10-09).
-- transition_request(): closed / returned only through the two functions.
-- Signature images become visible where they were applied: to people who may
-- see that request (approver confirming, later the PDF). Nowhere else.

-- ---------------------------------------------------------------------------
-- 1. Raju's note, the approvals log
-- ---------------------------------------------------------------------------
alter table public.signatures
  add column note text check (length(note) between 1 and 1000);
comment on column public.signatures.note is 'Raju''s note for the approver when he signs again after a return.';

create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests (id),
  decision text not null check (decision in ('confirmed', 'returned')),
  decided_by text not null references public.app_users (clerk_user_id),
  decided_at timestamptz not null default now(),
  comment text check (length(comment) between 1 and 1000),
  flagged_sections smallint[] not null default '{}',
  signature_id uuid references public.signatures (id),
  snapshot_id uuid references public.request_snapshots (id),
  check (
    (decision = 'returned' and comment is not null and signature_id is null)
    or (decision = 'confirmed' and signature_id is not null and snapshot_id is not null
        and cardinality(flagged_sections) = 0)
  )
);
comment on table public.approvals is 'Every approver decision: confirmed (with signature + snapshot) or returned (comment + flagged sections). Never edited or deleted.';

create index approvals_request_idx on public.approvals (request_id, decided_at);

create function private.set_decided_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.decided_at := now();
  return new;
end;
$$;

create trigger approvals_decided_at before insert on public.approvals
for each row execute function private.set_decided_at();
create trigger approvals_no_change before update or delete on public.approvals
for each row execute function private.forbid_change();

-- ---------------------------------------------------------------------------
-- 2. Who may see a request (mirrors the requests RLS policies; used where a
--    security definer function must decide on the caller's behalf)
-- ---------------------------------------------------------------------------
create function private.request_visible(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.requests r
    where r.id = p_request_id
      and (
        private.has_any_role(array['admin', 'requester', 'it_operator', 'auditor']::public.app_role[])
        or (private.has_any_role(array['approver']::public.app_role[])
            and r.state in ('pending_confirmation', 'returned', 'closed'))
      )
  );
$$;

-- A signature image may be read where it was applied (a current signature on
-- a request the caller may see) — besides its owner (F05 policy).
create function private.signature_file_visible(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.signatures s
    join public.signature_assets a on a.id = s.signature_asset_id
    where a.storage_path = p_name
      and s.cleared_at is null
      and private.request_visible(s.request_id)
  );
$$;

create policy "signatures: read where applied" on storage.objects
for select to authenticated
using (
  bucket_id = 'signatures'
  and (select private.is_active_user())
  and private.signature_file_visible(name)
);

-- The current signatures of a request, with the mark that was applied.
create function public.request_signature_marks(p_request_id uuid)
returns table (
  section text,
  signer_name text,
  signer_role public.app_role,
  signed_at timestamptz,
  kind text,
  source text,
  typed_text text,
  storage_path text,
  note text,
  sha256 text
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.section, private.user_name(s.signer_id), s.signer_role, s.signed_at,
    a.kind, a.source, a.typed_text, a.storage_path, s.note, n.sha256
  from public.signatures s
  join public.signature_assets a on a.id = s.signature_asset_id
  join public.request_snapshots n on n.id = s.snapshot_id
  where s.request_id = p_request_id
    and s.cleared_at is null
    and private.is_active_user()
    and private.request_visible(p_request_id)
  order by s.signed_at;
$$;
comment on function public.request_signature_marks(uuid) is 'Current signatures of a request the caller may see, with the applied mark (image path / typed initials).';

-- ---------------------------------------------------------------------------
-- 3. Signing (F06) with Raju's note after a return
-- ---------------------------------------------------------------------------
drop function public.sign_request(uuid, jsonb);

create function public.sign_request(p_request_id uuid, p_reviewed jsonb, p_note text default null)
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
  if not private.execution_complete(p_request_id) then
    raise exception 'section 9 checklist is not complete' using errcode = 'check_violation';
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
comment on function public.sign_request(uuid, jsonb, text) is 'Raju''s Review & sign: checks, frozen snapshot + SHA-256, signature with server time (+ note after a return), → pending_confirmation, audit.';

-- ---------------------------------------------------------------------------
-- 4. Confirm & sign, Return to Raju
-- ---------------------------------------------------------------------------
create function private.require_approver()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user text := private.current_user_id();
begin
  if v_user is null or not private.is_active_user() then
    raise exception 'sign in first' using errcode = 'insufficient_privilege';
  end if;
  if not private.has_any_role(array['approver']::public.app_role[]) then
    raise exception 'only an approver confirms or returns a request' using errcode = 'insufficient_privilege';
  end if;
  return v_user;
end;
$$;

-- What Confirm & sign shows the approver: exactly what he will sign.
create function public.approval_preview(p_request_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_approver();
  if not private.request_visible(p_request_id) then
    raise exception 'request not found' using errcode = 'no_data_found';
  end if;
  return private.request_snapshot_data(p_request_id);
end;
$$;
comment on function public.approval_preview(uuid) is 'The snapshot Confirm & sign shows; pass it back unchanged to confirm_request().';

create function public.confirm_request(p_request_id uuid, p_reviewed jsonb)
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
comment on function public.confirm_request(uuid, jsonb) is 'Approver''s Confirm & sign: not own request, own active signature, reviewed snapshot unchanged → signature (sections 3, 10, 11), closed, audit.';

create function public.return_request(p_request_id uuid, p_comment text, p_flagged smallint[] default '{}')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user text := private.require_approver();
  v_request public.requests;
  v_comment text := nullif(trim(p_comment), '');
  v_flagged smallint[];
  v_approval uuid;
begin
  select * into v_request from public.requests where id = p_request_id for update;
  if not found then
    raise exception 'request not found' using errcode = 'no_data_found';
  end if;
  if v_request.state <> 'pending_confirmation' then
    raise exception 'this request is not awaiting confirmation' using errcode = 'check_violation';
  end if;
  if v_comment is null or length(v_comment) > 1000 then
    raise exception 'say what needs fixing (up to 1000 characters)' using errcode = 'check_violation';
  end if;
  if exists (select 1 from unnest(coalesce(p_flagged, '{}')) f where f is null or f not between 1 and 9 or f = 3) then
    raise exception 'only sections 1–9 that Raju edits can be flagged' using errcode = 'check_violation';
  end if;
  v_flagged := array(select distinct f from unnest(coalesce(p_flagged, '{}')) f order by f);

  insert into public.approvals (request_id, decision, decided_by, comment, flagged_sections)
  values (p_request_id, 'returned', v_user, v_comment, v_flagged)
  returning id into v_approval;

  perform set_config('app.signature_clear', 'on', true);
  update public.signatures
  set cleared_at = now(), cleared_reason = 'Returned by the approver'
  where request_id = p_request_id and section = 'it_execution' and cleared_at is null;
  perform set_config('app.signature_clear', 'off', true);

  perform set_config('app.request_returning', 'on', true);
  perform public.transition_request(p_request_id, 'returned', v_comment);
  perform set_config('app.request_returning', 'off', true);

  perform private.write_audit('request.returned', 'request', p_request_id::text,
    jsonb_build_object('ticket_id', v_request.ticket_id, 'approval_id', v_approval,
      'flagged_sections', to_jsonb(v_flagged)));
  return v_approval;
end;
$$;
comment on function public.return_request(uuid, text, smallint[]) is 'Approver''s Return to Raju: comment required, sections to fix; clears Raju''s signature; → returned, audit.';

-- ---------------------------------------------------------------------------
-- 5. The state machine: closed / returned only through the functions above
-- ---------------------------------------------------------------------------
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
      if not private.execution_complete(p_request_id) then
        raise exception 'section 9 checklist is not complete' using errcode = 'check_violation';
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

-- ---------------------------------------------------------------------------
-- 6. Row Level Security and grants
-- ---------------------------------------------------------------------------
alter table public.approvals enable row level security;

create policy "approvals: visible with their request" on public.approvals
for select to authenticated
using (exists (select 1 from public.requests r where r.id = request_id));

revoke all on public.approvals from anon, authenticated, service_role;
grant select on public.approvals to authenticated, service_role;

revoke all on function private.set_decided_at() from public;
revoke all on function private.request_visible(uuid) from public;
revoke all on function private.require_approver() from public;
-- Storage evaluates its policy as the signed-in user.
revoke all on function private.signature_file_visible(text) from public;
grant execute on function private.signature_file_visible(text) to authenticated;

revoke all on function public.request_signature_marks(uuid) from public, anon;
revoke all on function public.sign_request(uuid, jsonb, text) from public, anon;
revoke all on function public.approval_preview(uuid) from public, anon;
revoke all on function public.confirm_request(uuid, jsonb) from public, anon;
revoke all on function public.return_request(uuid, text, smallint[]) from public, anon;
grant execute on function public.request_signature_marks(uuid) to authenticated;
grant execute on function public.sign_request(uuid, jsonb, text) to authenticated;
grant execute on function public.approval_preview(uuid) to authenticated;
grant execute on function public.confirm_request(uuid, jsonb) to authenticated;
grant execute on function public.return_request(uuid, text, smallint[]) to authenticated;

-- The mailbox choice no longer conflicts with the form (2026-10-13).
--
-- Raju: after choosing the mailbox option on an offboarding in execution,
-- typing anything showed "Not saved" and saving stopped. set_mailbox_handling
-- updated the request row, which bumped its version; the open form still held
-- the old version, so its next save was refused as a conflict. Updates made
-- inside the offboarding-work functions (flag app.removal_work) now keep the
-- version. request_before_update is its current definition with only that
-- rule changed.

create or replace function private.request_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_in_transition boolean := coalesce(current_setting('app.request_transition', true), '') = 'on';
begin
  if new.ticket_id is distinct from old.ticket_id
     or new.ticket_year is distinct from old.ticket_year
     or new.ticket_number is distinct from old.ticket_number
     or new.created_by is distinct from old.created_by
     or new.form_version_id is distinct from old.form_version_id then
    raise exception 'ticket ID, creator and form version cannot be changed'
      using errcode = 'insufficient_privilege';
  end if;
  if not v_in_transition and (
       new.state is distinct from old.state
       or new.state_changed_at is distinct from old.state_changed_at
       or new.execution_started_at is distinct from old.execution_started_at
       or new.closed_at is distinct from old.closed_at
       or new.cancelled_at is distinct from old.cancelled_at
       or new.cancelled_by is distinct from old.cancelled_by
       or new.cancel_reason is distinct from old.cancel_reason
       or new.return_reason is distinct from old.return_reason) then
    raise exception 'request state changes go through the workflow (transition_request)'
      using errcode = 'insufficient_privilege';
  end if;
  new.created_at := old.created_at;
  new.updated_at := now();
  -- The offboarding mailbox choice (set_mailbox_handling) isn't a typed form
  -- field: it doesn't bump the version, so the form's next save isn't
  -- refused as "changed somewhere else" (found 2026-10-13).
  new.version := case
    when coalesce(current_setting('app.removal_work', true), '') = 'on' then old.version
    else old.version + 1
  end;
  return new;
end;
$$;

-- F23b-2 — Email notifications: what the sender needs from the database.
--
--   outbox_email_facts(id)   the facts of one email (name, ticket, who signed,
--                            the return / confirmation, PDF name, SLA counts)
--                            in the shape lib/notifications/templates.ts reads,
--                            + whether it is still worth sending.
--   mark_outbox_skipped      an email no longer due (already confirmed, the
--                            removals are done, the person was deactivated)
--                            is skipped, not sent.
--   send-notifications       pg_cron every 5 minutes: when something is due,
--                            pg_net calls the app's sender route with a
--                            secret. URL + secret live in Supabase Vault
--                            (email_sender_url / email_sender_secret); without
--                            them nothing is called (local, CI, preview).
--
-- The sender (service role) has no signed-in user, so the screens' helpers
-- (request_sla() checks who reads) don't apply — this function is its view.

create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------------
-- 1. Skipped: an email that is no longer due
-- ---------------------------------------------------------------------------
alter table public.email_outbox drop constraint email_outbox_status_check;
alter table public.email_outbox add constraint email_outbox_status_check
  check (status in ('pending', 'sending', 'sent', 'failed', 'skipped'));

create function public.mark_outbox_skipped(p_id bigint, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.email_outbox
  set status = 'skipped', last_error = left(coalesce(p_reason, 'no longer due'), 500)
  where id = p_id and status = 'sending';
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. The facts of one email
-- ---------------------------------------------------------------------------
create function public.outbox_email_facts(p_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_mail public.email_outbox;
  v_req public.requests;
  v_signer public.signatures;
  v_decision public.approvals;
  v_sla jsonb;
  v_devices integer;
  v_due boolean := true;
  v_why text;
begin
  select * into v_mail from public.email_outbox where id = p_id;
  if not found then
    return null;
  end if;

  if not exists (select 1 from public.app_users
                 where clerk_user_id = v_mail.to_user and active) then
    v_due := false;
    v_why := 'the person was deactivated';
  end if;

  if v_mail.kind = 'test' then
    return jsonb_build_object('due', v_due, 'why', v_why, 'facts', jsonb_build_object(
      'kind', 'test', 'request', null, 'itSigner', null, 'decision', null,
      'pdfFileName', null, 'sla', null));
  end if;

  select * into v_req from public.requests where id = v_mail.request_id;

  select * into v_signer from public.signatures
  where request_id = v_req.id and section = 'it_execution'
  order by signed_at desc limit 1;

  if v_mail.kind = 'returned' then
    select * into v_decision from public.approvals
    where id = nullif(v_mail.details ->> 'approval_id', '')::uuid;
  elsif v_mail.kind = 'closed' then
    select * into v_decision from public.approvals
    where request_id = v_req.id and decision = 'confirmed'
    order by decided_at desc limit 1;
  end if;

  if v_mail.kind in ('sla_due', 'sla_missed') then
    v_sla := private.request_sla(v_req.id);
    select count(*) into v_devices from public.request_equipment_items
    where request_id = v_req.id and return_status = 'pending';
  end if;

  -- Still worth sending?
  if v_due then
    if v_mail.kind in ('waiting', 'reminder') and v_req.state <> 'pending_confirmation' then
      v_due := false;
      v_why := 'no longer waiting for confirmation';
    elsif v_mail.kind = 'returned' and v_req.state <> 'returned' then
      v_due := false;
      v_why := 'already signed again';
    elsif v_mail.kind in ('sla_due', 'sla_missed')
      and (v_req.state not in ('draft', 'in_execution', 'returned')
           or v_sla ->> 'removed_at' is not null) then
      v_due := false;
      v_why := 'the removals are finished';
    end if;
  end if;

  return jsonb_build_object('due', v_due, 'why', v_why, 'facts', jsonb_build_object(
    'kind', v_mail.kind,
    'request', jsonb_build_object(
      'id', v_req.id,
      'ticket', v_req.ticket_id,
      'type', v_req.type,
      'firstName', v_req.first_name,
      'lastName', v_req.last_name,
      'effectiveDate', v_req.effective_date,
      'lastWorkingDay', v_req.last_working_day,
      'waitingSince', case when v_req.state = 'pending_confirmation'
                           then private.utc_text(v_req.state_changed_at) end),
    'itSigner', case when v_signer.id is not null then jsonb_build_object(
      'name', coalesce(private.user_name(v_signer.signer_id), 'IT'),
      'signedAt', private.utc_text(v_signer.signed_at)) end,
    'decision', case when v_decision.id is not null then jsonb_build_object(
      'by', coalesce(private.user_name(v_decision.decided_by), 'The approver'),
      'at', private.utc_text(v_decision.decided_at),
      'comment', v_decision.comment,
      'flagged', to_jsonb(v_decision.flagged_sections)) end,
    'pdfFileName', (select file_name from public.pdf_documents
                    where request_id = v_req.id order by generated_at desc limit 1),
    'sla', case when v_sla is not null and v_req.sla_due_at is not null then jsonb_build_object(
      'dueAt', private.utc_text(v_req.sla_due_at),
      'timeline', v_req.sla_timeline,
      'done', coalesce((v_sla ->> 'done')::integer, 0),
      'total', coalesce((v_sla ->> 'total')::integer, 0),
      'devicesPending', v_devices) end
  ));
end;
$$;
comment on function public.outbox_email_facts(bigint) is 'The facts of one outbox email for the sender (service role): { due, why, facts } — facts in the shape of lib/notifications/templates.ts EmailFacts.';

-- ---------------------------------------------------------------------------
-- 3. Every 5 minutes: wake the sender when something is due
-- ---------------------------------------------------------------------------
create function private.call_email_sender()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  if not exists (
    select 1 from public.email_outbox
    where (status = 'pending' and send_after <= now())
       or (status = 'sending' and send_after < now() - interval '10 minutes')
  ) then
    return null;
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'email_sender_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'email_sender_secret';
  if v_url is null or v_secret is null then
    return null;
  end if;
  return net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
end;
$$;
comment on function private.call_email_sender() is 'pg_cron: calls the app''s email sender route when an email is due. Needs Vault secrets email_sender_url + email_sender_secret; returns the pg_net request id, or null when nothing was called.';

select cron.schedule(
  'send-notifications',
  '*/5 * * * *',
  $$select private.call_email_sender()$$
);

-- ---------------------------------------------------------------------------
-- 4. Grants
-- ---------------------------------------------------------------------------
revoke all on function private.call_email_sender() from public;
revoke all on function public.outbox_email_facts(bigint) from public, anon, authenticated;
revoke all on function public.mark_outbox_skipped(bigint, text) from public, anon, authenticated;
grant execute on function public.outbox_email_facts(bigint) to service_role;
grant execute on function public.mark_outbox_skipped(bigint, text) to service_role;

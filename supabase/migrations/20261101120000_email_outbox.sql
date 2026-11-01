-- F23a — Email notifications: settings + an outbox the sender works through.
--
--   notification_settings          one row: which emails are on, the reminder
--                                  delay (days) and the SLA warning (hours).
--   email_outbox                   one row per email and recipient; a dedupe
--                                  key makes every email exactly once.
--   requests trigger               signed → "waiting" to every approver who
--                                  didn't prepare or execute it; returned →
--                                  the IT signer; closed → the IT signer.
--   queue_scheduled_notifications  (pg_cron, every 15 min) reminders to
--                                  approvers once a day after N days; SLA due
--                                  soon / missed to IT.
--   claim_outbox / mark_outbox_sent / mark_outbox_failed
--                                  the sender (service role, F23b): 3 tries,
--                                  then failed with the reason.
--   admin_save_notification_settings / queue_test_email (admin, audited).
--
-- Decided 2026-11-01 (Raju): Resend from no-reply@access-notify.laine.ai;
-- all four emails + daily reminders after 2 days; SLA warning 6 h before.
-- Emails carry a name and a link only — the content is built when sending.

-- ---------------------------------------------------------------------------
-- 1. Settings (one row)
-- ---------------------------------------------------------------------------
create table public.notification_settings (
  id boolean primary key default true check (id),
  waiting boolean not null default true,
  reminder boolean not null default true,
  returned boolean not null default true,
  closed boolean not null default true,
  sla_due boolean not null default true,
  sla_missed boolean not null default true,
  reminder_after_days smallint not null default 2 check (reminder_after_days between 1 and 14),
  sla_warn_hours smallint not null default 6 check (sla_warn_hours between 1 and 48),
  updated_at timestamptz not null default now(),
  updated_by text references public.app_users (clerk_user_id)
);
comment on table public.notification_settings is 'Which notification emails are on (F23). One row; changed only by admin_save_notification_settings().';
insert into public.notification_settings default values;

alter table public.notification_settings enable row level security;
create policy "notification_settings: read as admin"
on public.notification_settings for select to authenticated
using ((select private.has_any_role(array['admin']::public.app_role[])));
revoke all on public.notification_settings from anon, authenticated, service_role;
grant select on public.notification_settings to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. The outbox
-- ---------------------------------------------------------------------------
create table public.email_outbox (
  id bigint generated always as identity primary key,
  kind text not null check (kind in
    ('waiting', 'reminder', 'returned', 'closed', 'sla_due', 'sla_missed', 'test')),
  request_id uuid references public.requests (id),
  to_user text not null references public.app_users (clerk_user_id),
  to_email text not null,
  dedupe_key text not null unique,
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'sent', 'failed')),
  attempts smallint not null default 0,
  last_error text check (length(last_error) <= 500),
  provider_id text,
  created_at timestamptz not null default now(),
  send_after timestamptz not null default now(),
  sent_at timestamptz,
  check ((kind = 'test') = (request_id is null))
);
comment on table public.email_outbox is 'Every notification email, one per recipient (F23). Written by triggers / functions only; the sender (service role) claims and marks rows. Never deleted.';
create index email_outbox_due_idx on public.email_outbox (send_after) where status = 'pending';
create index email_outbox_created_idx on public.email_outbox (created_at desc);

alter table public.email_outbox enable row level security;
create policy "email_outbox: read as admin"
on public.email_outbox for select to authenticated
using ((select private.has_any_role(array['admin']::public.app_role[])));
revoke all on public.email_outbox from anon, authenticated, service_role;
grant select on public.email_outbox to authenticated, service_role;

-- Server time only.
create function private.set_outbox_created_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_at := now();
  if new.send_after is null or new.send_after < now() then
    new.send_after := now();
  end if;
  return new;
end;
$$;
create trigger email_outbox_created_at before insert on public.email_outbox
for each row execute function private.set_outbox_created_at();

-- ---------------------------------------------------------------------------
-- 3. Who gets what
-- ---------------------------------------------------------------------------

-- Is this email switched on?
create function private.notification_on(p_kind text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((to_jsonb(s) ->> p_kind)::boolean, false)
  from public.notification_settings s
$$;

-- One email for one person (active, with an email), once per dedupe key.
create function private.queue_email(
  p_kind text,
  p_request uuid,
  p_user text,
  p_key text,
  p_details jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
begin
  if p_kind <> 'test' and not private.notification_on(p_kind) then
    return;
  end if;
  select email into v_email from public.app_users where clerk_user_id = p_user and active;
  if v_email is null then
    return;
  end if;
  insert into public.email_outbox (kind, request_id, to_user, to_email, dedupe_key, details)
  values (p_kind, p_request, p_user, v_email, p_key || ':' || p_user, coalesce(p_details, '{}'::jsonb))
  on conflict (dedupe_key) do nothing;
end;
$$;

-- The latest IT signer of a request (also after a return cleared it).
create function private.it_signer(p_request uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select signer_id from public.signatures
  where request_id = p_request and section = 'it_execution'
  order by signed_at desc limit 1
$$;

-- Every active approver who may confirm this request (not who prepared or
-- executed it).
create function private.approvers_for(p_request uuid)
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select distinct r.clerk_user_id
  from public.user_roles r
  join public.app_users u on u.clerk_user_id = r.clerk_user_id and u.active
  join public.requests q on q.id = p_request
  where r.role = 'approver'
    and r.clerk_user_id <> q.created_by
    and r.clerk_user_id is distinct from private.it_signer(p_request)
$$;

-- Signed → waiting; returned → the IT signer; closed → the IT signer.
create function private.notify_on_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_signature uuid;
  v_user text;
  v_return public.approvals;
begin
  if new.state = 'pending_confirmation' then
    -- Once per IT signature: signed again after a return = told again.
    select id into v_signature from public.signatures
    where request_id = new.id and section = 'it_execution' and cleared_at is null;
    for v_user in select private.approvers_for(new.id) loop
      perform private.queue_email('waiting', new.id, v_user,
        'waiting:' || new.id || ':' || coalesce(v_signature::text, 'none'));
    end loop;
  elsif new.state = 'returned' then
    select * into v_return from public.approvals
    where request_id = new.id and decision = 'returned'
    order by decided_at desc limit 1;
    v_user := private.it_signer(new.id);
    if v_user is not null then
      perform private.queue_email('returned', new.id, v_user,
        'returned:' || new.id || ':' || coalesce(v_return.id::text, 'none'),
        jsonb_build_object('approval_id', v_return.id));
    end if;
  elsif new.state = 'closed' then
    v_user := private.it_signer(new.id);
    if v_user is not null then
      perform private.queue_email('closed', new.id, v_user, 'closed:' || new.id);
    end if;
  end if;
  return null;
end;
$$;

create trigger requests_f_notify after update of state on public.requests
for each row when (new.state is distinct from old.state)
execute function private.notify_on_state();

-- ---------------------------------------------------------------------------
-- 4. Scheduled: reminders and SLA (pg_cron every 15 minutes)
-- ---------------------------------------------------------------------------
create function public.queue_scheduled_notifications()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings public.notification_settings;
  v_tz text;
  v_today text;
  v_before integer;
  v_after integer;
  v_req record;
  v_user text;
  v_sla jsonb;
begin
  select * into v_settings from public.notification_settings;
  select company_timezone into v_tz from public.app_settings;
  v_tz := coalesce(v_tz, 'Asia/Dubai');
  v_today := to_char(now() at time zone v_tz, 'YYYY-MM-DD');
  select count(*) into v_before from public.email_outbox;

  -- Reminders: waiting longer than N days — one a day per approver.
  if v_settings.reminder then
    for v_req in
      select id from public.requests
      where state = 'pending_confirmation'
        and state_changed_at <= now() - make_interval(days => v_settings.reminder_after_days)
    loop
      for v_user in select private.approvers_for(v_req.id) loop
        perform private.queue_email('reminder', v_req.id, v_user,
          'reminder:' || v_req.id || ':' || v_today);
      end loop;
    end loop;
  end if;

  -- SLA: open offboardings whose removals aren't all ticked.
  for v_req in
    select id, created_by, sla_due_at from public.requests
    where type = 'offboarding'
      and state in ('draft', 'in_execution', 'returned')
      and sla_due_at is not null
      and sla_due_at <= now() + make_interval(hours => v_settings.sla_warn_hours)
  loop
    v_sla := private.request_sla(v_req.id);
    continue when v_sla ->> 'removed_at' is not null;
    for v_user in
      select v_req.created_by
      union
      select r.clerk_user_id from public.user_roles r
      where r.role = 'it_operator' and r.clerk_user_id <> v_req.created_by
        and not exists (select 1 from public.app_users u
                        where u.clerk_user_id = v_req.created_by and u.active)
    loop
      if v_req.sla_due_at > now() then
        perform private.queue_email('sla_due', v_req.id, v_user, 'sla_due:' || v_req.id);
      else
        perform private.queue_email('sla_missed', v_req.id, v_user, 'sla_missed:' || v_req.id);
      end if;
    end loop;
  end loop;

  select count(*) into v_after from public.email_outbox;
  return v_after - v_before;
end;
$$;
comment on function public.queue_scheduled_notifications() is 'Queues the reminder and SLA emails that are due (pg_cron every 15 minutes). Returns how many were queued.';

select cron.schedule(
  'queue-notifications',
  '*/15 * * * *',
  $$select public.queue_scheduled_notifications()$$
);

-- ---------------------------------------------------------------------------
-- 5. The sender (service role, F23b)
-- ---------------------------------------------------------------------------

-- Up to p_limit due emails, marked "sending" (two senders never take the same).
create function public.claim_outbox(p_limit integer default 20)
returns setof public.email_outbox
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- A sender that died mid-way: back in the queue after 10 minutes.
  update public.email_outbox
  set status = 'pending'
  where status = 'sending' and send_after < now() - interval '10 minutes';

  return query
  update public.email_outbox o
  set status = 'sending', attempts = o.attempts + 1, send_after = now()
  where o.id in (
    select id from public.email_outbox
    where status = 'pending' and send_after <= now()
    order by send_after, id
    limit least(greatest(coalesce(p_limit, 20), 1), 100)
    for update skip locked
  )
  returning o.*;
end;
$$;

create function public.mark_outbox_sent(p_id bigint, p_provider_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.email_outbox;
begin
  update public.email_outbox
  set status = 'sent', sent_at = now(), provider_id = left(p_provider_id, 200), last_error = null
  where id = p_id and status = 'sending'
  returning * into v;
  if found then
    perform private.write_audit('notification.sent', 'email_outbox', p_id::text,
      jsonb_build_object('kind', v.kind, 'to', v.to_user, 'request_id', v.request_id));
  end if;
end;
$$;

-- A failed try: again in 5 / 30 minutes; after the 3rd, failed for good.
create function public.mark_outbox_failed(p_id bigint, p_error text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.email_outbox;
begin
  update public.email_outbox
  set status = case when attempts >= 3 then 'failed' else 'pending' end,
      send_after = now() + case when attempts = 1 then interval '5 minutes' else interval '30 minutes' end,
      last_error = left(coalesce(p_error, 'unknown error'), 500)
  where id = p_id and status = 'sending'
  returning * into v;
  if found and v.status = 'failed' then
    perform private.write_audit('notification.failed', 'email_outbox', p_id::text,
      jsonb_build_object('kind', v.kind, 'to', v.to_user, 'request_id', v.request_id,
        'error', v.last_error));
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Admin: settings and a test email
-- ---------------------------------------------------------------------------
create function public.admin_save_notification_settings(
  p_waiting boolean,
  p_reminder boolean,
  p_returned boolean,
  p_closed boolean,
  p_sla_due boolean,
  p_sla_missed boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin text := private.require_admin();
  v_before jsonb;
  v_after jsonb;
begin
  select to_jsonb(s) - array['id', 'updated_at', 'updated_by'] into v_before
  from public.notification_settings s;
  update public.notification_settings
  set waiting = p_waiting, reminder = p_reminder, returned = p_returned,
      closed = p_closed, sla_due = p_sla_due, sla_missed = p_sla_missed,
      updated_at = now(), updated_by = v_admin;
  select to_jsonb(s) - array['id', 'updated_at', 'updated_by'] into v_after
  from public.notification_settings s;
  if v_before is distinct from v_after then
    perform private.write_audit('notification.settings_changed', 'notification_settings', 'notifications',
      jsonb_build_object('before', v_before, 'after', v_after));
  end if;
end;
$$;

-- A test email to the admin themselves.
create function public.queue_test_email()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin text := private.require_admin();
begin
  perform private.queue_email('test', null, v_admin, 'test:' || gen_random_uuid());
  perform private.write_audit('notification.test_queued', 'email_outbox', null, '{}'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Grants
-- ---------------------------------------------------------------------------
revoke all on function private.notification_on(text) from public;
revoke all on function private.queue_email(text, uuid, text, text, jsonb) from public;
revoke all on function private.it_signer(uuid) from public;
revoke all on function private.approvers_for(uuid) from public;

revoke all on function public.queue_scheduled_notifications() from public, anon, authenticated;
revoke all on function public.claim_outbox(integer) from public, anon, authenticated;
revoke all on function public.mark_outbox_sent(bigint, text) from public, anon, authenticated;
revoke all on function public.mark_outbox_failed(bigint, text) from public, anon, authenticated;
revoke all on function public.admin_save_notification_settings(boolean, boolean, boolean, boolean, boolean, boolean) from public, anon;
revoke all on function public.queue_test_email() from public, anon;

grant execute on function public.queue_scheduled_notifications() to service_role;
grant execute on function public.claim_outbox(integer) to service_role;
grant execute on function public.mark_outbox_sent(bigint, text) to service_role;
grant execute on function public.mark_outbox_failed(bigint, text) to service_role;
grant execute on function public.admin_save_notification_settings(boolean, boolean, boolean, boolean, boolean, boolean) to authenticated;
grant execute on function public.queue_test_email() to authenticated;

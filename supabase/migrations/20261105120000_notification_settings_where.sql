-- F23d — Admin → Notifications: Save failed with "UPDATE requires a WHERE
-- clause". Calls through the API (PostgREST's authenticator role) load
-- Supabase's pg_safeupdate, which refuses an UPDATE without WHERE — even on
-- a one-row table. pgTAP runs as postgres without it, so only the browser
-- test found it. Same function, with `where id` (the one row's key).

create or replace function public.admin_save_notification_settings(
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
      updated_at = now(), updated_by = v_admin
  where id;
  select to_jsonb(s) - array['id', 'updated_at', 'updated_by'] into v_after
  from public.notification_settings s;
  if v_before is distinct from v_after then
    perform private.write_audit('notification.settings_changed', 'notification_settings', 'notifications',
      jsonb_build_object('before', v_before, 'after', v_after));
  end if;
end;
$$;

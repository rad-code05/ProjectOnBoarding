-- Each person's own timezone for the screens (asked by Raju, 2026-10-12).
--
-- app_users.timezone: null = the company timezone (app_settings, D3). Only
-- the screens use it; the PDF record, ticket years, reports and SLA
-- deadlines stay on the company timezone so everyone sees the same record.
-- set_my_timezone(): a person changes only their own (or back to the company
-- default with null); checked against pg_timezone_names; audited.
-- my_timezone(): the timezone the signed-in person's screens use.

alter table public.app_users add column timezone text;
comment on column public.app_users.timezone is 'Display timezone chosen on My profile; null = company timezone (app_settings).';

create function public.set_my_timezone(p_timezone text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user text := private.current_user_id();
  v_before text;
  v_after text := nullif(trim(p_timezone), '');
begin
  if v_user is null or not private.is_active_user() then
    raise exception 'sign in first' using errcode = 'insufficient_privilege';
  end if;
  if v_after is not null
     and not exists (select 1 from pg_catalog.pg_timezone_names where name = v_after) then
    raise exception 'unknown timezone: %', v_after using errcode = 'check_violation';
  end if;

  select timezone into v_before from public.app_users where clerk_user_id = v_user;
  update public.app_users set timezone = v_after where clerk_user_id = v_user;
  if v_before is distinct from v_after then
    perform private.write_audit('account.timezone_changed', 'app_user', v_user,
      jsonb_build_object('before', v_before, 'after', v_after));
  end if;
  return coalesce(v_after, private.company_timezone());
end;
$$;
comment on function public.set_my_timezone(text) is 'My profile: set (or clear with null) the signed-in person''s own display timezone; validated; audited.';

create function public.my_timezone()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select timezone from public.app_users where clerk_user_id = private.current_user_id()),
    private.company_timezone());
$$;
comment on function public.my_timezone() is 'The timezone the signed-in person''s screens use: their own, else the company timezone.';

revoke all on function public.set_my_timezone(text) from public, anon;
revoke all on function public.my_timezone() from public, anon;
grant execute on function public.set_my_timezone(text) to authenticated;
grant execute on function public.my_timezone() to authenticated;

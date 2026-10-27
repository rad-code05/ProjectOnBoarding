-- Offboarding access: a tick or a note (Raju, 2026-10-27).
--
--   Physical / logical access on an offboarding is a must only for access
--   the person **holds** (an access type in their inventory, granted on an
--   earlier request): it must be ticked removed **or** carry a note (e.g.
--   "badge collected Friday by HR"). Access added by hand on the
--   offboarding is optional — it never blocks Review & sign.
--   private.offboarding_blockers()  the access line counts held rows only,
--       done or noted ("Access disabled or removed, or a note why not").
--   private.request_sla()           the SLA counts every application, and
--       access rows that are done, or held and not explained by a note — a
--       noted badge or an optional row never turns into "SLA missed".
--   public.set_access_note()        the note on an access row, while the
--       offboarding is in execution (or returned); audited.
-- Both private functions are replaced from their latest definition
-- (offboarding_blockers: 20261013130000_relaxed_signing.sql; request_sla:
-- 20261013120000_offboarding_work.sql).

-- Held = the person holds this access type today (inventory, not ended).
create function private.access_row_is_held(p_request public.requests, p_type_id smallint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.employee_access_inventory i
    where i.employee_id = p_request.employee_id
      and i.kind = 'access' and i.access_type_id = p_type_id and i.ended_at is null
  );
$$;
revoke all on function private.access_row_is_held(public.requests, smallint) from public;

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
  v_access int; v_access_done int; v_access_all int;
begin
  select * into v_request from public.requests where id = p_request_id;
  if not found or v_request.type <> 'offboarding' then
    return v_out;
  end if;
  select count(*), count(done_at), count(*) filter (where removal_method is null)
  into v_apps, v_apps_done, v_no_method
  from public.request_access_items where request_id = p_request_id;
  select count(*),
         count(*) filter (where private.access_row_is_held(v_request, type_id)),
         count(*) filter (where private.access_row_is_held(v_request, type_id)
                            and (done_at is not null or nullif(trim(notes), '') is not null))
  into v_access_all, v_access, v_access_done
  from public.request_physical_access_items where request_id = p_request_id;

  if v_request.sla_due_at is null then
    v_out := array_append(v_out, 'Access removal SLA (timeline and cut-off)');
  end if;
  if v_apps + v_access_all = 0 then
    v_out := array_append(v_out, 'At least one application or access to remove');
  end if;
  if v_no_method > 0 then
    v_out := array_append(v_out, format('Removal method (Delete, Suspend or Disable) for %s application(s)', v_no_method));
  end if;
  if v_apps_done < v_apps then
    v_out := array_append(v_out, format('Applications removed (%s of %s)', v_apps_done, v_apps));
  end if;
  if v_access_done < v_access then
    v_out := array_append(v_out, format('Access disabled or removed, or a note why not (%s of %s)', v_access_done, v_access));
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

create or replace function private.request_sla(p_request_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with req as (
    select * from public.requests where id = p_request_id and type = 'offboarding'
  ), rows as (
    select a.done_at from public.request_access_items a where a.request_id = p_request_id
    union all
    -- Access counts when removed, or when held and not explained by a note.
    select pa.done_at
    from public.request_physical_access_items pa, req
    where pa.request_id = p_request_id
      and (pa.done_at is not null
           or (private.access_row_is_held(req, pa.type_id) and nullif(trim(pa.notes), '') is null))
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
  from req r, t;
$$;

-- The note on an access row ("badge collected Friday by HR"), in execution.
create function public.set_access_note(p_item_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request uuid;
  v_name text;
  v_before text;
  v_note text := nullif(left(trim(p_note), 500), '');
begin
  perform private.require_offboarding_worker();
  select request_id, type_name, notes into v_request, v_name, v_before
  from public.request_physical_access_items where id = p_item_id;
  if v_request is null then
    raise exception 'row not found' using errcode = 'no_data_found';
  end if;
  perform private.lock_offboarding_for_work(v_request);
  if v_note is not distinct from v_before then
    return;
  end if;
  perform set_config('app.removal_work', 'on', true);
  update public.request_physical_access_items set notes = v_note where id = p_item_id;
  perform set_config('app.removal_work', 'off', true);
  perform private.write_audit('request.removal_note_set', 'request', v_request::text,
    jsonb_build_object('item_id', p_item_id, 'name', v_name, 'before', v_before, 'after', v_note));
end;
$$;
revoke all on function public.set_access_note(uuid, text) from public;
grant execute on function public.set_access_note(uuid, text) to authenticated;
comment on function public.set_access_note(uuid, text) is
  'Offboarding: a note on an access row (why it is not removed yet / how it will be); counts like a tick for Review & sign; audited.';

-- Section 9: "Not needed" (asked by Raju, 2026-10-13).
--
-- Each checklist answer is true (done), false (not done yet) or the string
-- "not_needed" (it doesn't apply — e.g. no device was provided). "Not needed"
-- counts as complete, so it raises no warning at Review & sign; the record and
-- the PDF print "Not needed" instead of "No". Each function below is its
-- current definition with only that rule changed.

-- 1. Answers may be true, false or "not_needed".
create or replace function private.execution_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type public.request_type;
  v_bad text;
begin
  if tg_op = 'UPDATE' and new.request_id is distinct from old.request_id then
    raise exception 'the request of a confirmation cannot change' using errcode = 'insufficient_privilege';
  end if;
  select r.type into v_type from public.requests r where r.id = new.request_id;
  select k into v_bad
  from jsonb_each(new.checks) as c(k, v)
  where (jsonb_typeof(v) <> 'boolean' and v <> '"not_needed"'::jsonb)
     or not exists (select 1 from public.execution_checklist_items i
                    where i.key = k and i.active and v_type = any (i.applies_to))
  limit 1;
  if v_bad is not null then
    raise exception 'checklist item % does not apply to this request', v_bad using errcode = 'check_violation';
  end if;
  new.notes := nullif(trim(new.notes), '');
  new.executed_by := coalesce(private.current_user_id(), new.executed_by);
  new.created_at := case when tg_op = 'INSERT' then now() else old.created_at end;
  new.updated_at := now();
  return new;
end;
$$;

-- 2. Done or not needed counts as complete.
-- True when every active checklist item of the request's type is done or not needed.
create or replace function private.execution_complete(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(bool_and(coalesce(c.checks -> i.key in ('true'::jsonb, '"not_needed"'::jsonb), false)), false)
  from public.requests r
  join public.execution_checklist_items i on i.active and r.type = any (i.applies_to)
  left join public.execution_confirmations c on c.request_id = r.id
  where r.id = p_request_id
$$;

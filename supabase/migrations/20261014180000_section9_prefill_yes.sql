-- Section 9 on an access change, part 2 (Raju, 2026-10-14): an item whose
-- area the request DOES change starts as done (true) — "you made the changes
-- in the user's rights, so access was modified: Yes". Untouched areas stay
-- "no_change". Raju can still untick an item.
--
-- private.access_change_checks() replaced (same rules, true instead of
-- nothing for a changed area). Access changes already in execution get the
-- same answers for items that are still blank; an answer someone set stays.
create or replace function private.access_change_checks(p_request_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'access_provisioned',
      case when exists (select 1 from public.request_access_items where request_id = p_request_id)
             or exists (select 1 from public.request_physical_access_items where request_id = p_request_id)
           then 'true'::jsonb else to_jsonb('no_change'::text) end,
    'devices_enrolled',
      case when exists (select 1 from public.request_equipment_items where request_id = p_request_id)
           then 'true'::jsonb else to_jsonb('no_change'::text) end,
    'security_controls',
      case when exists (select 1 from public.request_access_items
                        where request_id = p_request_id and inventory_id is null and action <> 'Remove')
             or exists (select 1 from public.request_physical_access_items
                        where request_id = p_request_id and inventory_id is null
                          and action not in ('Disable', 'Remove'))
             or exists (select 1 from public.request_equipment_items
                        where request_id = p_request_id and action = 'Issue')
           then 'true'::jsonb else to_jsonb('no_change'::text) end)
$$;
comment on function private.access_change_checks(uuid) is 'Section 9 answers an access change starts with: true where the request changes that area, "no_change" where it does not.';

-- Open access changes already in execution: fill the blanks the same way.
update public.execution_confirmations c
set checks = private.access_change_checks(c.request_id) || c.checks
from public.requests r
where r.id = c.request_id
  and r.type = 'access_modification'
  and r.state in ('in_execution', 'returned');

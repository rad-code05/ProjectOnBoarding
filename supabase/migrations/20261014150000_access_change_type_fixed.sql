-- F10b — An access change stays an access change (like an offboarding): it
-- is started from "Who is changing?" for one person, and its lines point to
-- that person's inventory, so a draft can't be switched to or from it.
create function private.request_access_change_type_fixed()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.type is distinct from old.type and 'access_modification' in (new.type, old.type) then
    raise exception 'an access change is started from New request and stays an access change'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
comment on function private.request_access_change_type_fixed() is 'Refuses switching a request to or from access_modification.';

create trigger requests_c_access_change_type_fixed before update of type on public.requests
for each row execute function private.request_access_change_type_fixed();

revoke all on function private.request_access_change_type_fixed() from public;

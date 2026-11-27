-- Finance department (Raju, 2026-11-27): the staff import (F24) has a person
-- in Finance. Data, not code — retired with active = false, never deleted.
insert into public.departments (name, sort_order)
values ('Finance', 100)
on conflict (name) do nothing;

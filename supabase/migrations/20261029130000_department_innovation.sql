-- Innovation department (Raju, 2026-10-29): his access sheet's teams include
-- Innovation (manager Mariel Jazz); a batch row with it was refused. Data,
-- not code — retired with active = false, never deleted (Admin screen F21).
insert into public.departments (name, sort_order)
values ('Innovation', 80)
on conflict (name) do nothing;

-- F15a: the Laine assistant — database.
--
--   ai_models      the models an admin can pick (added / edited / retired in
--                  Admin → AI settings; never deleted — chats remember which
--                  model answered), with prices for the monthly budget
--   ai_settings    one row: on / off, the model in use, monthly budget (USD),
--                  questions per person per hour
--   ai_chats       a person's chats (own rows only), deleted 60 days after
--   ai_messages    the last message by a daily pg_cron job (D7 part 2)
--   ai_usage       one row per answer: tokens and cost — for the budget and
--                  the hourly limit (no chat text)
--   ai_memory      per person: name to use, favourite reports, frequent
--                  questions, request types (never chat text); own row only
--
-- The chat route (F15c) runs with the person's own session: it checks
-- ai_status() before answering and calls record_ai_usage() after.
-- Every admin change is audited (ai.*); clearing memory / deleting chats is
-- audited without the content.

-- Server times only (never typed by anyone).
create function private.set_ai_timestamps()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then new.created_at := now(); else new.created_at := old.created_at; end if;
  new.updated_at := now();
  return new;
end;
$$;
create function private.set_ai_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create function private.set_ai_created_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Models
-- ---------------------------------------------------------------------------
create table public.ai_models (
  id smallint generated always as identity primary key,
  name text not null check (length(name) between 1 and 80),
  model_id text not null check (model_id ~ '^[a-z0-9][a-z0-9.-]{1,79}$'),
  note text check (note is null or length(note) <= 200),
  price_in numeric(10, 4) not null check (price_in >= 0 and price_in <= 1000),
  price_out numeric(10, 4) not null check (price_out >= 0 and price_out <= 1000),
  active boolean not null default true,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index ai_models_name_key on public.ai_models (lower(name));
create unique index ai_models_model_id_key on public.ai_models (model_id);
comment on table public.ai_models is
  'Models the assistant may use (F15). Prices are USD per million tokens, for the monthly budget. Retired, never deleted.';

create trigger ai_models_timestamps before insert or update on public.ai_models
  for each row execute function private.set_ai_timestamps();

-- Prices from Anthropic's price list (2026-10-06).
insert into public.ai_models (name, model_id, note, price_in, price_out, sort_order) values
  ('Claude Sonnet 5.5', 'claude-sonnet-5-5', 'Balanced — good answers at a moderate cost.', 2, 10, 10),
  ('Claude Opus 5.5', 'claude-opus-5-5', 'Strongest for long analysis; costs more per question.', 4, 20, 20),
  ('Claude Haiku 4.5', 'claude-haiku-4-5', 'Fastest; fine for short questions.', 1, 5, 30);

-- ---------------------------------------------------------------------------
-- Settings (one row)
-- ---------------------------------------------------------------------------
create table public.ai_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default true,
  model smallint not null references public.ai_models (id),
  monthly_budget_usd numeric(10, 2) not null default 50 check (monthly_budget_usd >= 0 and monthly_budget_usd <= 100000),
  hourly_limit integer not null default 30 check (hourly_limit between 1 and 1000),
  updated_by text references public.app_users (clerk_user_id),
  updated_at timestamptz not null default now()
);
comment on table public.ai_settings is
  'Assistant settings (F15): on / off, model in use, monthly budget in USD, questions per person per hour.';

create trigger ai_settings_timestamps before insert or update on public.ai_settings
  for each row execute function private.set_ai_updated_at();

insert into public.ai_settings (model)
select id from public.ai_models where model_id = 'claude-sonnet-5-5';

-- ---------------------------------------------------------------------------
-- Chats and messages (own rows only)
-- ---------------------------------------------------------------------------
create table public.ai_chats (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default private.current_user_id()
    references public.app_users (clerk_user_id) on delete cascade,
  title text check (title is null or length(title) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger ai_chats_timestamps before insert or update on public.ai_chats
  for each row execute function private.set_ai_timestamps();
create index ai_chats_user_idx on public.ai_chats (user_id, updated_at desc);
comment on table public.ai_chats is
  'A person''s chats with the assistant (F15). Only the person sees them; deleted 60 days after the last message.';

create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.ai_chats (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  -- The AI SDK message parts (text, tool calls and their results).
  parts jsonb not null check (jsonb_typeof(parts) = 'array'),
  model smallint references public.ai_models (id),
  created_at timestamptz not null default now()
);
create trigger ai_messages_created_at before insert on public.ai_messages
  for each row execute function private.set_ai_created_at();
create index ai_messages_chat_idx on public.ai_messages (chat_id, created_at);
comment on table public.ai_messages is 'Messages of an assistant chat (F15); deleted with their chat.';

-- A new message keeps its chat alive for another 60 days.
create function private.touch_ai_chat()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.ai_chats set updated_at = now() where id = new.chat_id;
  return new;
end;
$$;
revoke all on function private.touch_ai_chat() from public;
create trigger ai_messages_touch_chat after insert on public.ai_messages
  for each row execute function private.touch_ai_chat();

-- ---------------------------------------------------------------------------
-- Usage (for the budget and the hourly limit; no chat text)
-- ---------------------------------------------------------------------------
create table public.ai_usage (
  id bigint generated always as identity primary key,
  user_id text not null references public.app_users (clerk_user_id) on delete cascade,
  model smallint not null references public.ai_models (id),
  input_tokens integer not null check (input_tokens >= 0),
  output_tokens integer not null check (output_tokens >= 0),
  cost_usd numeric(12, 6) not null check (cost_usd >= 0),
  created_at timestamptz not null default now()
);
create trigger ai_usage_created_at before insert on public.ai_usage
  for each row execute function private.set_ai_created_at();
create index ai_usage_created_idx on public.ai_usage (created_at);
create index ai_usage_user_idx on public.ai_usage (user_id, created_at);
comment on table public.ai_usage is
  'One row per assistant answer (F15): tokens and cost, for the monthly budget and the hourly limit. No chat text.';

-- ---------------------------------------------------------------------------
-- Memory (own row only; never chat text)
-- ---------------------------------------------------------------------------
create table public.ai_memory (
  user_id text primary key default private.current_user_id()
    references public.app_users (clerk_user_id) on delete cascade,
  call_me text check (call_me is null or length(call_me) between 1 and 40),
  favourite_reports text[] not null default '{}' check (cardinality(favourite_reports) <= 5),
  frequent_questions text[] not null default '{}' check (cardinality(frequent_questions) <= 5),
  request_types public.request_type[] not null default '{}',
  updated_at timestamptz not null default now()
);
comment on table public.ai_memory is
  'What the assistant remembers about a person (F15): name to use, favourite reports, frequent questions, request types. Never chat text; only the person sees it.';

create trigger ai_memory_timestamps before insert or update on public.ai_memory
  for each row execute function private.set_ai_updated_at();

-- ---------------------------------------------------------------------------
-- RLS + grants
-- ---------------------------------------------------------------------------
alter table public.ai_models enable row level security;
alter table public.ai_settings enable row level security;
alter table public.ai_chats enable row level security;
alter table public.ai_messages enable row level security;
alter table public.ai_usage enable row level security;
alter table public.ai_memory enable row level security;

create policy "ai_models: signed-in users read" on public.ai_models
  for select to authenticated using (private.is_active_user());
create policy "ai_settings: signed-in users read" on public.ai_settings
  for select to authenticated using (private.is_active_user());

create policy "ai_chats: own" on public.ai_chats
  for all to authenticated
  using (user_id = private.current_user_id())
  with check (user_id = private.current_user_id() and private.is_active_user());

create policy "ai_messages: own chats" on public.ai_messages
  for all to authenticated
  using (exists (select 1 from public.ai_chats c
                 where c.id = chat_id and c.user_id = private.current_user_id()))
  with check (exists (select 1 from public.ai_chats c
                      where c.id = chat_id and c.user_id = private.current_user_id()));

create policy "ai_usage: own, admins all" on public.ai_usage
  for select to authenticated
  using (user_id = private.current_user_id()
         or private.has_any_role(array['admin']::public.app_role[]));

create policy "ai_memory: own" on public.ai_memory
  for all to authenticated
  using (user_id = private.current_user_id())
  with check (user_id = private.current_user_id() and private.is_active_user());

grant select on public.ai_models, public.ai_settings to authenticated;
grant select, insert, update, delete on public.ai_chats to authenticated;
grant select, insert, delete on public.ai_messages to authenticated;
grant select on public.ai_usage to authenticated;
grant select, insert, update, delete on public.ai_memory to authenticated;

-- ---------------------------------------------------------------------------
-- Status for the chat route: may this person ask now?
-- ---------------------------------------------------------------------------
create function public.ai_status()
returns table (
  enabled boolean,
  model_id text,
  model smallint,
  monthly_budget_usd numeric,
  spent_this_month_usd numeric,
  hourly_limit integer,
  asked_last_hour integer,
  -- 'ok' | 'off' | 'budget' | 'rate'
  reason text,
  resets_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user text := private.current_user_id();
  v_settings public.ai_settings;
  v_model public.ai_models;
  v_tz text := private.company_timezone();
  v_month_start timestamptz := date_trunc('month', now() at time zone v_tz) at time zone v_tz;
  v_spent numeric;
  v_asked integer;
  v_oldest timestamptz;
begin
  if v_user is null or not private.is_active_user() then
    raise exception 'not signed in' using errcode = 'insufficient_privilege';
  end if;
  select * into v_settings from public.ai_settings where id;
  select * into v_model from public.ai_models where id = v_settings.model;
  select coalesce(sum(u.cost_usd), 0) into v_spent
    from public.ai_usage u where u.created_at >= v_month_start;
  select count(*)::integer, min(u.created_at) into v_asked, v_oldest
    from public.ai_usage u
    where u.user_id = v_user and u.created_at > now() - interval '1 hour';

  return query select
    v_settings.enabled, v_model.model_id, v_model.id,
    v_settings.monthly_budget_usd, round(v_spent, 2),
    v_settings.hourly_limit, v_asked,
    case
      when not v_settings.enabled then 'off'
      when v_spent >= v_settings.monthly_budget_usd then 'budget'
      when v_asked >= v_settings.hourly_limit then 'rate'
      else 'ok'
    end,
    case
      when v_spent >= v_settings.monthly_budget_usd
        then ((date_trunc('month', now() at time zone v_tz) + interval '1 month') at time zone v_tz)
      when v_asked >= v_settings.hourly_limit then v_oldest + interval '1 hour'
    end;
end;
$$;
comment on function public.ai_status() is
  'May the signed-in person ask the assistant now? Settings, model, the month''s spend (company timezone), their questions in the last hour, and why not.';

-- After each answer: tokens → cost with the model's prices.
create function public.record_ai_usage(p_model smallint, p_input_tokens integer, p_output_tokens integer)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user text := private.current_user_id();
  v_model public.ai_models;
  v_cost numeric;
begin
  if v_user is null or not private.is_active_user() then
    raise exception 'not signed in' using errcode = 'insufficient_privilege';
  end if;
  if p_input_tokens is null or p_output_tokens is null
     or p_input_tokens < 0 or p_output_tokens < 0
     or p_input_tokens > 10000000 or p_output_tokens > 10000000 then
    raise exception 'token counts must be between 0 and 10 million' using errcode = 'check_violation';
  end if;
  select * into v_model from public.ai_models where id = p_model;
  if not found then
    raise exception 'unknown model' using errcode = 'no_data_found';
  end if;
  v_cost := round((p_input_tokens * v_model.price_in + p_output_tokens * v_model.price_out) / 1000000.0, 6);
  insert into public.ai_usage (user_id, model, input_tokens, output_tokens, cost_usd)
  values (v_user, p_model, p_input_tokens, p_output_tokens, v_cost);
  return v_cost;
end;
$$;
comment on function public.record_ai_usage(smallint, integer, integer) is
  'Records one assistant answer for the signed-in person: tokens and the cost from the model''s prices.';

-- ---------------------------------------------------------------------------
-- Own data: clear memory, delete chats (audited without the content)
-- ---------------------------------------------------------------------------
create function public.forget_my_ai_memory()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user text := private.current_user_id();
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = 'insufficient_privilege';
  end if;
  delete from public.ai_memory where user_id = v_user;
  perform private.write_audit('ai.memory_cleared', 'app_user', v_user, '{}'::jsonb);
end;
$$;

create function public.delete_my_ai_chats()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user text := private.current_user_id();
  v_n integer;
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = 'insufficient_privilege';
  end if;
  delete from public.ai_chats where user_id = v_user;
  get diagnostics v_n = row_count;
  perform private.write_audit('ai.chats_deleted', 'app_user', v_user, jsonb_build_object('chats', v_n));
  return v_n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin: models and settings (audited ai.*)
-- ---------------------------------------------------------------------------
create function public.admin_save_ai_model(
  p_id smallint,
  p_name text,
  p_model_id text,
  p_note text,
  p_price_in numeric,
  p_price_out numeric
)
returns smallint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_model_id text := lower(trim(coalesce(p_model_id, '')));
  v_note text := nullif(regexp_replace(trim(coalesce(p_note, '')), '\s+', ' ', 'g'), '');
  v_before public.ai_models;
  v_id smallint;
begin
  perform private.require_admin();
  v_name := private.clean_name(p_name, 'a model');
  if v_model_id !~ '^[a-z0-9][a-z0-9.-]{1,79}$' then
    raise exception 'a model ID has lower-case letters, digits, dots and dashes' using errcode = 'check_violation';
  end if;
  if v_note is not null and length(v_note) > 200 then
    raise exception 'a note has up to 200 characters' using errcode = 'check_violation';
  end if;
  if p_price_in is null or p_price_out is null
     or p_price_in < 0 or p_price_out < 0 or p_price_in > 1000 or p_price_out > 1000 then
    raise exception 'prices are USD per million tokens, 0–1000' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.ai_models where lower(name) = lower(v_name) and id is distinct from p_id) then
    raise exception 'a model called % already exists', v_name using errcode = 'unique_violation';
  end if;
  if exists (select 1 from public.ai_models where model_id = v_model_id and id is distinct from p_id) then
    raise exception 'the model ID % is already in the list', v_model_id using errcode = 'unique_violation';
  end if;

  if p_id is null then
    insert into public.ai_models (name, model_id, note, price_in, price_out, sort_order)
    values (v_name, v_model_id, v_note, p_price_in, p_price_out,
            (select coalesce(max(sort_order), 0) + 10 from public.ai_models))
    returning id into v_id;
    perform private.write_audit('ai.model_added', 'ai_model', v_id::text,
      jsonb_build_object('after', jsonb_build_object('name', v_name, 'model_id', v_model_id,
        'price_in', p_price_in, 'price_out', p_price_out)));
  else
    select * into v_before from public.ai_models where id = p_id for update;
    if not found then
      raise exception 'unknown model' using errcode = 'no_data_found';
    end if;
    update public.ai_models
    set name = v_name, model_id = v_model_id, note = v_note, price_in = p_price_in, price_out = p_price_out
    where id = p_id;
    v_id := p_id;
    if (v_before.name, v_before.model_id, v_before.note, v_before.price_in, v_before.price_out)
       is distinct from (v_name, v_model_id, v_note, p_price_in, p_price_out) then
      perform private.write_audit('ai.model_changed', 'ai_model', v_id::text,
        jsonb_build_object(
          'before', jsonb_build_object('name', v_before.name, 'model_id', v_before.model_id,
            'price_in', v_before.price_in, 'price_out', v_before.price_out),
          'after', jsonb_build_object('name', v_name, 'model_id', v_model_id,
            'price_in', p_price_in, 'price_out', p_price_out)));
    end if;
  end if;
  return v_id;
end;
$$;

create function public.admin_set_ai_model_active(p_id smallint, p_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_model public.ai_models;
begin
  perform private.require_admin();
  select * into v_model from public.ai_models where id = p_id for update;
  if not found then
    raise exception 'unknown model' using errcode = 'no_data_found';
  end if;
  if not coalesce(p_active, true) and exists (select 1 from public.ai_settings where model = p_id) then
    raise exception 'the model in use can''t be retired — choose another model first' using errcode = 'check_violation';
  end if;
  if v_model.active is distinct from coalesce(p_active, true) then
    update public.ai_models set active = coalesce(p_active, true) where id = p_id;
    perform private.write_audit(
      case when coalesce(p_active, true) then 'ai.model_restored' else 'ai.model_retired' end,
      'ai_model', p_id::text, jsonb_build_object('name', v_model.name));
  end if;
end;
$$;

create function public.admin_save_ai_settings(
  p_enabled boolean,
  p_model smallint,
  p_monthly_budget_usd numeric,
  p_hourly_limit integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before public.ai_settings;
begin
  perform private.require_admin();
  if p_enabled is null then
    raise exception 'on or off?' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.ai_models where id = p_model and active) then
    raise exception 'choose a model that is not retired' using errcode = 'check_violation';
  end if;
  if p_monthly_budget_usd is null or p_monthly_budget_usd < 0 or p_monthly_budget_usd > 100000 then
    raise exception 'the monthly budget is 0–100,000 USD' using errcode = 'check_violation';
  end if;
  if p_hourly_limit is null or p_hourly_limit < 1 or p_hourly_limit > 1000 then
    raise exception 'questions per hour are 1–1000' using errcode = 'check_violation';
  end if;
  select * into v_before from public.ai_settings where id for update;
  update public.ai_settings
  set enabled = p_enabled, model = p_model, monthly_budget_usd = round(p_monthly_budget_usd, 2),
      hourly_limit = p_hourly_limit, updated_by = private.current_user_id()
  where id;
  if (v_before.enabled, v_before.model, v_before.monthly_budget_usd, v_before.hourly_limit)
     is distinct from (p_enabled, p_model, round(p_monthly_budget_usd, 2), p_hourly_limit) then
    perform private.write_audit('ai.settings_changed', 'ai_settings', 'ai',
      jsonb_build_object(
        'before', jsonb_build_object('enabled', v_before.enabled, 'model', v_before.model,
          'monthly_budget_usd', v_before.monthly_budget_usd, 'hourly_limit', v_before.hourly_limit),
        'after', jsonb_build_object('enabled', p_enabled, 'model', p_model,
          'monthly_budget_usd', round(p_monthly_budget_usd, 2), 'hourly_limit', p_hourly_limit)));
  end if;
end;
$$;

-- This month's use for Admin → AI settings (admins only).
create function public.ai_usage_this_month()
returns table (spent_usd numeric, answers integer, people integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz text := private.company_timezone();
  v_month_start timestamptz := date_trunc('month', now() at time zone v_tz) at time zone v_tz;
begin
  perform private.require_admin();
  return query
  select round(coalesce(sum(u.cost_usd), 0), 2), count(*)::integer, count(distinct u.user_id)::integer
  from public.ai_usage u where u.created_at >= v_month_start;
end;
$$;

-- ---------------------------------------------------------------------------
-- 60 days: delete old chats every day (pg_cron)
-- ---------------------------------------------------------------------------
create function private.purge_old_ai_chats()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  delete from public.ai_chats where updated_at < now() - interval '60 days';
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
comment on function private.purge_old_ai_chats() is
  'Deletes assistant chats whose last message is more than 60 days old (run daily by pg_cron).';
revoke all on function private.purge_old_ai_chats() from public;

create extension if not exists pg_cron;
select cron.schedule('purge-old-ai-chats', '15 2 * * *', $$select private.purge_old_ai_chats()$$);

-- ---------------------------------------------------------------------------
-- Grants on functions
-- ---------------------------------------------------------------------------
revoke all on function public.ai_status() from public, anon;
revoke all on function public.record_ai_usage(smallint, integer, integer) from public, anon;
revoke all on function public.forget_my_ai_memory() from public, anon;
revoke all on function public.delete_my_ai_chats() from public, anon;
revoke all on function public.admin_save_ai_model(smallint, text, text, text, numeric, numeric) from public, anon;
revoke all on function public.admin_set_ai_model_active(smallint, boolean) from public, anon;
revoke all on function public.admin_save_ai_settings(boolean, smallint, numeric, integer) from public, anon;
revoke all on function public.ai_usage_this_month() from public, anon;
grant execute on function public.ai_status() to authenticated;
grant execute on function public.record_ai_usage(smallint, integer, integer) to authenticated;
grant execute on function public.forget_my_ai_memory() to authenticated;
grant execute on function public.delete_my_ai_chats() to authenticated;
grant execute on function public.admin_save_ai_model(smallint, text, text, text, numeric, numeric) to authenticated;
grant execute on function public.admin_set_ai_model_active(smallint, boolean) to authenticated;
grant execute on function public.admin_save_ai_settings(boolean, smallint, numeric, integer) to authenticated;
grant execute on function public.ai_usage_this_month() to authenticated;

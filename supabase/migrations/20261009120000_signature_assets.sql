-- F05a — Signature assets (My profile) and their private storage.
--
-- Decided 2026-10-09: everyone uploads their OWN signature / initials
-- (Raju, Moises, Celine); nobody — not even an admin — can add or see
-- someone else's. A signature is an internal acknowledgment (D13).
--
--   * signature_assets: one row per version. kind = signature (PNG) or
--     initials (PNG or typed, 1–4 characters). A new version RETIRES the
--     previous one of the same kind (kept for history — past records keep
--     the version they used) and becomes the ACTIVE one. One active asset
--     per person; switch with public.set_active_signature().
--   * Rows are never edited or deleted directly; the activation flags change
--     only inside the database functions (transaction-local flag, as in F04).
--   * Files live in the PRIVATE bucket "signatures" under <clerk user id>/…;
--     PNG only, max 1 MB (bucket limits + storage policies). The app
--     re-encodes uploads on the server before storing them (F05b).

-- ---------------------------------------------------------------------------
-- 1. Table
-- ---------------------------------------------------------------------------
create table public.signature_assets (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.app_users (clerk_user_id),
  kind text not null check (kind in ('signature', 'initials')),
  source text not null check (source in ('png', 'typed')),
  storage_path text,
  typed_text text,
  width integer check (width between 1 and 4000),
  height integer check (height between 1 and 4000),
  byte_size integer check (byte_size between 1 and 1048576),
  sha256 text check (sha256 ~ '^[0-9a-f]{64}$'),
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  retired_at timestamptz,
  check (
    (source = 'png' and storage_path is not null and typed_text is null
       and width is not null and height is not null and byte_size is not null and sha256 is not null)
    or (source = 'typed' and typed_text is not null and storage_path is null)
  ),
  check (kind = 'initials' or source = 'png'),
  check (typed_text is null or (length(trim(typed_text)) between 1 and 4 and typed_text = trim(typed_text))),
  check (not (is_active and retired_at is not null))
);
comment on table public.signature_assets is 'Signature / initials versions per person (own only). One active; replaced versions kept for history.';
create index signature_assets_user_idx on public.signature_assets (user_id);
create unique index signature_assets_one_active on public.signature_assets (user_id) where is_active;

-- New version: stamps the time, checks the file path, retires the previous
-- version of the same kind and makes the new one active.
create function private.signature_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.storage_path is not null and new.storage_path not like new.user_id || '/%' then
    raise exception 'a signature file must be stored under its owner''s folder'
      using errcode = 'check_violation';
  end if;
  perform set_config('app.signature_change', 'on', true);
  update public.signature_assets
  set is_active = false,
      retired_at = case when kind = new.kind and retired_at is null then now() else retired_at end
  where user_id = new.user_id and (is_active or (kind = new.kind and retired_at is null));
  perform set_config('app.signature_change', 'off', true);
  new.created_at := now();
  new.retired_at := null;
  new.is_active := true;
  return new;
end;
$$;
create trigger signature_assets_before_insert
before insert on public.signature_assets
for each row execute function private.signature_before_insert();

-- Rows never change except the two flags, and only inside our functions.
create function private.signature_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(current_setting('app.signature_change', true), '') <> 'on'
     or (to_jsonb(new) - 'is_active' - 'retired_at') is distinct from (to_jsonb(old) - 'is_active' - 'retired_at')
     or (old.retired_at is not null and new.retired_at is distinct from old.retired_at) then
    raise exception 'signature versions are never edited — upload a new one'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;
create trigger signature_assets_before_update
before update on public.signature_assets
for each row execute function private.signature_before_update();

create function private.audit_signature_assets()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.write_audit('signature.added', 'signature_asset', new.id::text,
    jsonb_build_object('kind', new.kind, 'source', new.source, 'sha256', new.sha256));
  return null;
end;
$$;
create trigger signature_assets_audit
after insert on public.signature_assets
for each row execute function private.audit_signature_assets();

-- "Sign with": choose which current (not replaced) version is active.
create function public.set_active_signature(p_asset_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user text := private.current_user_id();
begin
  if v_user is null or not private.is_active_user() then
    raise exception 'sign in first' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.signature_assets
                 where id = p_asset_id and user_id = v_user and retired_at is null) then
    raise exception 'that is not one of your current signatures' using errcode = 'insufficient_privilege';
  end if;
  perform set_config('app.signature_change', 'on', true);
  update public.signature_assets set is_active = false where user_id = v_user and is_active and id <> p_asset_id;
  update public.signature_assets set is_active = true where id = p_asset_id and not is_active;
  perform set_config('app.signature_change', 'off', true);
  perform private.write_audit('signature.activated', 'signature_asset', p_asset_id::text, '{}'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Row Level Security and grants — own rows only
-- ---------------------------------------------------------------------------
alter table public.signature_assets enable row level security;

create policy "signature_assets: read own" on public.signature_assets
for select to authenticated
using (user_id = (select private.current_user_id()) and (select private.is_active_user()));

create policy "signature_assets: add own" on public.signature_assets
for insert to authenticated
with check (user_id = (select private.current_user_id()) and (select private.is_active_user()));

revoke all on public.signature_assets from anon, authenticated, service_role;
grant select, insert on public.signature_assets to authenticated;
grant select on public.signature_assets to service_role;

revoke all on function public.set_active_signature(uuid) from public, anon;
grant execute on function public.set_active_signature(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Private storage bucket — own folder only, PNG ≤ 1 MB
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('signatures', 'signatures', false, 1048576, array['image/png']);

create policy "signatures: upload into own folder" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'signatures'
  and (storage.foldername(name))[1] = (select private.current_user_id())
  and (select private.is_active_user())
);

create policy "signatures: read own files" on storage.objects
for select to authenticated
using (
  bucket_id = 'signatures'
  and (storage.foldername(name))[1] = (select private.current_user_id())
  and (select private.is_active_user())
);
-- No update / delete policies: stored versions are never replaced in place.

-- F08a: the PDF record of a closed request, and the company timezone (D3).
--
-- app_settings: one row of company settings. company_timezone (D3, decided
--   2026-10-11): default Asia/Dubai, chosen by an admin; used for ticket years,
--   dates on screen and the time printed on the PDF.
-- pdf_documents: one PDF per closed request (D18: a PDF exists only once the
--   request is approved), made from the approval snapshot and stored in the
--   private bucket "records" under <ticket id>/<file name>. Never edited or
--   deleted; every later download is the same file (its SHA-256 is kept).
-- record_pdf(): records the uploaded PDF (admin / approver / auditor, closed
--   request they may see). log_record_download(): audit of each download.

-- ---------------------------------------------------------------------------
-- 1. Company settings (D3)
-- ---------------------------------------------------------------------------
create table public.app_settings (
  id boolean primary key default true check (id),
  company_timezone text not null default 'Asia/Dubai',
  updated_at timestamptz not null default now(),
  updated_by text references public.app_users (clerk_user_id)
);
comment on table public.app_settings is 'Company settings (one row). Changed only through set_company_timezone() and later Admin functions.';
insert into public.app_settings default values;

-- Now read from the settings (was a fixed Europe/Zurich while D3 was open).
create or replace function private.company_timezone()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select company_timezone from public.app_settings where id), 'Asia/Dubai');
$$;

create function public.set_company_timezone(p_timezone text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user text := private.current_user_id();
  v_before text := private.company_timezone();
begin
  if v_user is null or not private.is_active_user()
     or not private.has_any_role(array['admin']::public.app_role[]) then
    raise exception 'only an admin changes the company timezone' using errcode = 'insufficient_privilege';
  end if;
  if p_timezone is null or not exists (select 1 from pg_catalog.pg_timezone_names where name = p_timezone) then
    raise exception 'unknown timezone: %', p_timezone using errcode = 'check_violation';
  end if;
  update public.app_settings
  set company_timezone = p_timezone, updated_at = now(), updated_by = v_user
  where id;
  perform private.write_audit('settings.timezone_changed', 'settings', 'company_timezone',
    jsonb_build_object('before', v_before, 'after', p_timezone));
  return p_timezone;
end;
$$;
comment on function public.set_company_timezone(text) is 'Admin: set the company timezone (D3); validated against pg_timezone_names; audited.';

-- ---------------------------------------------------------------------------
-- 2. The PDF record
-- ---------------------------------------------------------------------------
create table public.pdf_documents (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.requests (id),
  snapshot_id uuid not null references public.request_snapshots (id),
  file_name text not null check (file_name ~ '^[a-z0-9][a-z0-9.-]*\.pdf$'),
  storage_path text not null unique,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  byte_size integer not null check (byte_size between 1 and 10485760),
  timezone text not null,
  generated_by text not null references public.app_users (clerk_user_id),
  generated_at timestamptz not null default now()
);
comment on table public.pdf_documents is 'The PDF record of a closed request (one per request), made from its approval snapshot. Never edited or deleted.';

create function private.set_generated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.generated_at := now();
  return new;
end;
$$;

create trigger pdf_documents_generated_at before insert on public.pdf_documents
for each row execute function private.set_generated_at();
create trigger pdf_documents_no_change before update or delete on public.pdf_documents
for each row execute function private.forbid_change();

-- Who exports records: admin, approver, auditor (design/pdf-export.md).
create function private.can_export_records()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_active_user()
    and private.has_any_role(array['admin', 'approver', 'auditor']::public.app_role[]);
$$;

-- The closed request a records file belongs to ("<ticket id>/<file>"), if the
-- caller may export it; null otherwise.
create function private.record_file_request(p_name text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select r.id
  from public.requests r
  where r.ticket_id = (storage.foldername(p_name))[1]
    and r.state = 'closed'
    and private.can_export_records()
    and private.request_visible(r.id);
$$;

create function public.record_pdf(
  p_request_id uuid,
  p_file_name text,
  p_sha256 text,
  p_byte_size integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user text := private.current_user_id();
  v_request public.requests;
  v_snapshot uuid;
  v_path text;
  v_id uuid;
begin
  if v_user is null or not private.can_export_records() then
    raise exception 'only admins, approvers and auditors export records' using errcode = 'insufficient_privilege';
  end if;
  select * into v_request from public.requests where id = p_request_id for update;
  if not found or not private.request_visible(p_request_id) then
    raise exception 'request not found' using errcode = 'no_data_found';
  end if;
  if v_request.state <> 'closed' then
    raise exception 'a PDF exists only once the request is approved' using errcode = 'check_violation';
  end if;

  -- The first PDF recorded is the record; later calls get the same one.
  select id into v_id from public.pdf_documents where request_id = p_request_id;
  if found then
    return v_id;
  end if;

  if p_file_name is null
     or p_file_name not like '%-' || replace(v_request.type::text, '_', '-') || '.pdf' then
    raise exception 'the file name must end with -%.pdf', replace(v_request.type::text, '_', '-')
      using errcode = 'check_violation';
  end if;
  v_path := v_request.ticket_id || '/' || p_file_name;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'records' and o.name = v_path) then
    raise exception 'upload the PDF first' using errcode = 'check_violation';
  end if;

  select a.snapshot_id into v_snapshot
  from public.approvals a
  where a.request_id = p_request_id and a.decision = 'confirmed'
  order by a.decided_at desc
  limit 1;
  if v_snapshot is null then
    raise exception 'no approval snapshot for this request' using errcode = 'check_violation';
  end if;

  insert into public.pdf_documents
    (request_id, snapshot_id, file_name, storage_path, sha256, byte_size, timezone, generated_by)
  values (p_request_id, v_snapshot, p_file_name, v_path, p_sha256, p_byte_size,
    private.company_timezone(), v_user)
  returning id into v_id;

  perform private.write_audit('record.generated', 'request', p_request_id::text,
    jsonb_build_object('ticket_id', v_request.ticket_id, 'file_name', p_file_name,
      'sha256', p_sha256, 'snapshot_id', v_snapshot));
  return v_id;
end;
$$;
comment on function public.record_pdf(uuid, text, text, integer) is 'Records the uploaded PDF of a closed request (one per request; first wins), audited as record.generated.';

create function public.log_record_download(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doc public.pdf_documents;
  v_ticket text;
begin
  if private.current_user_id() is null or not private.can_export_records() then
    raise exception 'only admins, approvers and auditors export records' using errcode = 'insufficient_privilege';
  end if;
  select d.* into v_doc from public.pdf_documents d
  where d.request_id = p_request_id and private.request_visible(p_request_id);
  if not found then
    raise exception 'no PDF for this request' using errcode = 'no_data_found';
  end if;
  select ticket_id into v_ticket from public.requests where id = p_request_id;
  perform private.write_audit('record.downloaded', 'request', p_request_id::text,
    jsonb_build_object('ticket_id', v_ticket, 'file_name', v_doc.file_name, 'sha256', v_doc.sha256));
end;
$$;
comment on function public.log_record_download(uuid) is 'Audit event for one download of a PDF record.';

-- ---------------------------------------------------------------------------
-- 3. Private storage bucket "records" — PDF only, ≤ 10 MB
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('records', 'records', false, 10485760, array['application/pdf']);

create policy "records: upload the PDF of a closed request" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'records'
  and private.record_file_request(name) is not null
  and not exists (
    select 1 from public.pdf_documents d where d.request_id = private.record_file_request(name)
  )
);

create policy "records: read the PDF of a closed request" on storage.objects
for select to authenticated
using (
  bucket_id = 'records'
  and private.record_file_request(name) is not null
);
-- No update / delete policies: a record is never replaced.

-- ---------------------------------------------------------------------------
-- 4. Row Level Security and grants
-- ---------------------------------------------------------------------------
alter table public.app_settings enable row level security;
alter table public.pdf_documents enable row level security;

create policy "app_settings: active users read" on public.app_settings
for select to authenticated
using ((select private.is_active_user()));

create policy "pdf_documents: exporters read with their request" on public.pdf_documents
for select to authenticated
using (
  (select private.can_export_records())
  and exists (select 1 from public.requests r where r.id = request_id)
);

revoke all on public.app_settings from anon, authenticated, service_role;
revoke all on public.pdf_documents from anon, authenticated, service_role;
grant select on public.app_settings to authenticated, service_role;
grant select on public.pdf_documents to authenticated, service_role;

revoke all on function private.set_generated_at() from public;
-- Storage evaluates its policies as the signed-in user.
revoke all on function private.can_export_records() from public;
revoke all on function private.record_file_request(text) from public;
grant execute on function private.can_export_records() to authenticated;
grant execute on function private.record_file_request(text) to authenticated;

revoke all on function public.set_company_timezone(text) from public, anon;
revoke all on function public.record_pdf(uuid, text, text, integer) from public, anon;
revoke all on function public.log_record_download(uuid) from public, anon;
grant execute on function public.set_company_timezone(text) to authenticated;
grant execute on function public.record_pdf(uuid, text, text, integer) to authenticated;
grant execute on function public.log_record_download(uuid) to authenticated;

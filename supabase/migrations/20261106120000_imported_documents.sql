-- F24d-2 — The original signed form of an Imported record.
--
-- People imported by F24 were onboarded (and some offboarded) on paper; the
-- signed form is on SharePoint. An admin may attach that PDF to the
-- Imported record (optional, any time); the record's red note then turns
-- calm. Decided 2026-11-05 (Raju), board *Phone · An imported person*.
--
--   imported_documents            one current PDF per Imported record; a
--                                 replaced one is kept (replaced_at), never
--                                 deleted. Read by whoever reads records.
--   attach_imported_document()    admin only, Imported records only, the
--                                 file must be in the `records` bucket under
--                                 the record's ticket (`IMP-…/…`); audited
--                                 import.document_attached.
--   log_imported_document_download()  one audit event per download
--                                 (import.document_downloaded), like PDF
--                                 records.
--
-- The file goes to the private `records` bucket: its existing policies
-- already let admins, approvers and auditors read (and upload) under a
-- closed request's ticket folder — an Imported record is a closed request.

create table public.imported_documents (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests (id),
  file_name text not null check (length(trim(file_name)) between 1 and 200),
  storage_path text not null unique check (length(storage_path) <= 300),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes integer not null check (size_bytes between 1 and 10485760),
  attached_by text not null references public.app_users (clerk_user_id),
  attached_at timestamptz not null default now(),
  replaced_at timestamptz
);
create unique index imported_documents_one_current on public.imported_documents (request_id)
  where replaced_at is null;
comment on table public.imported_documents is
  'The original signed form (PDF) attached to an Imported record (F24d-2). One current per record; replaced ones are kept.';

-- ---------------------------------------------------------------------------
-- Attach (or replace) the signed PDF
-- ---------------------------------------------------------------------------
create function public.attach_imported_document(
  p_request_id uuid,
  p_storage_path text,
  p_file_name text,
  p_sha256 text,
  p_size integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin text := private.require_admin();
  v_request public.requests;
  v_previous public.imported_documents;
  v_id uuid;
begin
  select * into v_request from public.requests where id = p_request_id for update;
  if not found or v_request.import_id is null or v_request.state <> 'closed' then
    raise exception 'only an Imported record takes its original signed form'
      using errcode = 'check_violation';
  end if;
  if p_storage_path is null or p_storage_path not like v_request.ticket_id || '/%' then
    raise exception 'the file belongs in the record''s own folder' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from storage.objects o
                 where o.bucket_id = 'records' and o.name = p_storage_path) then
    raise exception 'upload the PDF first' using errcode = 'check_violation';
  end if;

  select * into v_previous from public.imported_documents
  where request_id = p_request_id and replaced_at is null
  for update;
  if found then
    update public.imported_documents set replaced_at = now() where id = v_previous.id;
  end if;

  insert into public.imported_documents (request_id, file_name, storage_path, sha256, size_bytes, attached_by)
  values (p_request_id, left(trim(p_file_name), 200), p_storage_path, lower(p_sha256), p_size, v_admin)
  returning id into v_id;

  perform private.write_audit('import.document_attached', 'request', p_request_id::text,
    jsonb_build_object(
      'ticket_id', v_request.ticket_id, 'file_name', left(trim(p_file_name), 200),
      'sha256', lower(p_sha256), 'replaced', v_previous.id is not null));
  return v_id;
end;
$$;
comment on function public.attach_imported_document(uuid, text, text, text, integer) is
  'F24d-2: an admin attaches (or replaces) the original signed PDF of an Imported record; audited.';

-- ---------------------------------------------------------------------------
-- Every download audited
-- ---------------------------------------------------------------------------
create function public.log_imported_document_download(p_document_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doc public.imported_documents;
  v_ticket text;
begin
  if private.current_user_id() is null or not private.can_export_records() then
    raise exception 'only admins, approvers and auditors export records' using errcode = 'insufficient_privilege';
  end if;
  select d.* into v_doc from public.imported_documents d
  where d.id = p_document_id and private.request_visible(d.request_id);
  if not found then
    raise exception 'no such document' using errcode = 'no_data_found';
  end if;
  select ticket_id into v_ticket from public.requests where id = v_doc.request_id;
  perform private.write_audit('import.document_downloaded', 'request', v_doc.request_id::text,
    jsonb_build_object('ticket_id', v_ticket, 'file_name', v_doc.file_name, 'sha256', v_doc.sha256));
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security and grants
-- ---------------------------------------------------------------------------
alter table public.imported_documents enable row level security;
create policy "imported_documents: record readers read" on public.imported_documents
for select to authenticated
using (
  (select private.can_export_records())
  -- The request's own rules (RLS) decide whether it is visible.
  and exists (select 1 from public.requests r where r.id = request_id)
);

revoke all on public.imported_documents from anon, authenticated, service_role;
grant select on public.imported_documents to authenticated, service_role;

revoke all on function public.attach_imported_document(uuid, text, text, text, integer) from public, anon;
revoke all on function public.log_imported_document_download(uuid) from public, anon;
grant execute on function public.attach_imported_document(uuid, text, text, text, integer) to authenticated;
grant execute on function public.log_imported_document_download(uuid) to authenticated;

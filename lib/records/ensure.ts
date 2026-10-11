import "server-only";
import { createHash } from "node:crypto";
import { SIGNATURE_BUCKET } from "@/lib/profile/signatures";
import { personName } from "@/lib/requests/labels";
import { pdfFileName, snapshotSchema } from "@/lib/requests/signing";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { RecordInput, RecordSignature } from "./record";
import { renderRecordPdf } from "./render";

export const RECORDS_BUCKET = "records";

/** The stored PDF record of a closed request (`pdf_documents`). */
export type PdfRecord = {
  requestId: string;
  ticketId: string;
  fileName: string;
  storagePath: string;
  sha256: string;
  byteSize: number;
  timezone: string;
  generatedAt: string;
};

type Supabase = ReturnType<typeof createServerSupabaseClient>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function storedRecord(
  supabase: Supabase,
  requestId: string,
): Promise<PdfRecord | null> {
  const { data } = await supabase
    .from("pdf_documents")
    .select(
      "request_id, file_name, storage_path, sha256, byte_size, timezone, generated_at, request:requests!pdf_documents_request_id_fkey(ticket_id)",
    )
    .eq("request_id", requestId)
    .maybeSingle();
  if (!data) return null;
  return {
    requestId: data.request_id,
    ticketId: data.request.ticket_id,
    fileName: data.file_name,
    storagePath: data.storage_path,
    sha256: data.sha256,
    byteSize: data.byte_size,
    timezone: data.timezone,
    generatedAt: data.generated_at,
  };
}

/**
 * Everything the PDF prints, read with the signed-in user's session: the
 * approval snapshot, the request's fixed facts, the applied signatures (with
 * their images — "visible where applied"), the checklist and the timezone.
 */
async function loadRecordInput(
  supabase: Supabase,
  requestId: string,
): Promise<RecordInput | null> {
  const { data: request } = await supabase
    .from("requests")
    .select(
      "id, ticket_id, type, state, priority, created_at, closed_at, assignee:app_users!requests_assignee_id_fkey(first_name, last_name)",
    )
    .eq("id", requestId)
    .maybeSingle();
  if (!request || request.state !== "closed" || !request.closed_at) {
    return null;
  }

  const [approval, marks, checklist, settings] = await Promise.all([
    supabase
      .from("approvals")
      .select(
        "snapshot:request_snapshots!approvals_snapshot_id_fkey(data, sha256)",
      )
      .eq("request_id", requestId)
      .eq("decision", "confirmed")
      .order("decided_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.rpc("request_signature_marks", { p_request_id: requestId }),
    supabase
      .from("execution_checklist_items")
      .select("key, label")
      .contains("applies_to", [request.type])
      .eq("active", true)
      .order("sort_order"),
    supabase.from("app_settings").select("company_timezone").maybeSingle(),
  ]);
  const snapshotRow = approval.data?.snapshot;
  const parsed = snapshotSchema.safeParse(snapshotRow?.data);
  if (!snapshotRow || !parsed.success || marks.error || checklist.error) {
    throw new Error("Could not read the signed record.");
  }

  const signatures: RecordSignature[] = await Promise.all(
    (marks.data ?? []).map(async (m) => {
      let image: Buffer | null = null;
      if (m.storage_path) {
        const file = await supabase.storage
          .from(SIGNATURE_BUCKET)
          .download(m.storage_path);
        if (file.error) throw new Error("Could not read a signature image.");
        image = Buffer.from(await file.data.arrayBuffer());
      }
      return {
        section: m.section as RecordSignature["section"],
        signerName: m.signer_name ?? "—",
        signedAt: m.signed_at,
        typedText: m.typed_text,
        image,
        note: m.note,
      };
    }),
  );

  const snapshot = parsed.data;
  return {
    snapshot,
    fingerprint: snapshotRow.sha256,
    fileName: pdfFileName(
      snapshot.request.first_name,
      snapshot.request.last_name,
      snapshot.request.type,
    ),
    timezone: settings.data?.company_timezone ?? "Asia/Dubai",
    generatedAt: new Date().toISOString(),
    request: {
      priority: request.priority,
      assigneeName:
        personName(request.assignee?.first_name, request.assignee?.last_name) ||
        null,
      openedAt: request.created_at,
      closedAt: request.closed_at,
    },
    checklist: checklist.data ?? [],
    signatures,
  };
}

/**
 * The PDF record of a closed request: the stored one, or — the first time —
 * made from the approval snapshot, stored under <ticket>/<file> and recorded
 * (the database keeps the first one; every later call returns it).
 * null = not closed, not visible, or the caller may not export records.
 */
export async function ensureRecordPdf(
  requestId: string,
): Promise<PdfRecord | null> {
  if (!UUID.test(requestId)) return null;
  const supabase = createServerSupabaseClient();
  const existing = await storedRecord(supabase, requestId);
  if (existing) return existing;

  const input = await loadRecordInput(supabase, requestId);
  if (!input) return null;
  const path = `${input.snapshot.request.ticket_id}/${input.fileName}`;

  let { bytes, sha256 } = await renderRecordPdf(input);
  const upload = await supabase.storage
    .from(RECORDS_BUCKET)
    .upload(path, bytes, { contentType: "application/pdf", upsert: false });
  if (upload.error) {
    // Someone stored it a moment ago (or a recording failed): use that file.
    const stored = await supabase.storage.from(RECORDS_BUCKET).download(path);
    if (stored.error) throw new Error("Could not store the PDF record.");
    bytes = Buffer.from(await stored.data.arrayBuffer());
    sha256 = createHash("sha256").update(bytes).digest("hex");
  }

  const recorded = await supabase.rpc("record_pdf", {
    p_request_id: requestId,
    p_file_name: input.fileName,
    p_sha256: sha256,
    p_byte_size: bytes.length,
  });
  if (recorded.error) throw new Error("Could not record the PDF.");
  return storedRecord(supabase, requestId);
}

/**
 * The stored file, checked against the fingerprint recorded when it was
 * made — a changed file is never handed out.
 */
export async function readRecordPdf(record: PdfRecord): Promise<Buffer> {
  const supabase = createServerSupabaseClient();
  const file = await supabase.storage
    .from(RECORDS_BUCKET)
    .download(record.storagePath);
  if (file.error) throw new Error("Could not read the PDF record.");
  const bytes = Buffer.from(await file.data.arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (sha256 !== record.sha256) {
    throw new Error("The stored PDF does not match its fingerprint.");
  }
  return bytes;
}

/** One audit event per download (`record.downloaded`). */
export async function logRecordDownload(requestId: string) {
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.rpc("log_record_download", {
    p_request_id: requestId,
  });
  if (error) throw new Error("Could not log the download.");
}

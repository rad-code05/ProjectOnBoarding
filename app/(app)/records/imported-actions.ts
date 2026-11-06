"use server";

import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import * as z from "zod";
import { requireRole } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * F24d-2: an admin attaches (or replaces) the original signed form of an
 * Imported record. The file must really be a PDF (its first bytes say so),
 * ≤ 10 MB; it goes to the private `records` bucket under the record's
 * ticket, then `attach_imported_document()` records it (audited).
 */

const MAX_BYTES = 10 * 1024 * 1024;
const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

export async function attachSignedPdf(
  requestId: string,
  form: FormData,
): Promise<{ ok: true } | { ok: false; message: string }> {
  await requireRole("admin");
  const id = z.uuid().safeParse(requestId);
  const file = form.get("file");
  if (!id.success || !(file instanceof File) || file.size === 0)
    return { ok: false, message: "Choose the signed PDF." };
  if (file.size > MAX_BYTES)
    return { ok: false, message: "The PDF is larger than 10 MB." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!PDF.every((b, i) => bytes[i] === b))
    return { ok: false, message: "This file isn't a PDF." };

  const db = createServerSupabaseClient();
  const { data: request } = await db
    .from("requests")
    .select("ticket_id, import_id")
    .eq("id", id.data)
    .maybeSingle();
  if (!request?.import_id)
    return {
      ok: false,
      message: "Only an Imported record takes its signed form.",
    };

  const path = `${request.ticket_id}/signed-original-${randomUUID()}.pdf`;
  const upload = await db.storage
    .from("records")
    .upload(path, bytes, { contentType: "application/pdf", upsert: false });
  if (upload.error)
    return {
      ok: false,
      message: "Could not store the PDF. Try again in a moment.",
    };

  const { error } = await db.rpc("attach_imported_document", {
    p_request_id: id.data,
    p_storage_path: path,
    p_file_name: file.name.slice(0, 200),
    p_sha256: createHash("sha256").update(bytes).digest("hex"),
    p_size: bytes.byteLength,
  });
  if (error)
    return {
      ok: false,
      message:
        error.code === "42501"
          ? "Only an admin attaches the signed form."
          : "Could not attach the PDF. Try again.",
    };
  revalidatePath(`/records/${id.data}`);
  return { ok: true };
}

import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { PAGES } from "@/lib/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * The original signed form of an Imported record (F24d-2): the current
 * attached PDF, for whoever reads records; every download audited
 * (`import.document_downloaded`). Never cached.
 */
export async function GET(
  _request: Request,
  ctx: RouteContext<"/records/[id]/original">,
) {
  await requireRole(...PAGES.records.roles);
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const db = createServerSupabaseClient();
  const { data: doc } = await db
    .from("imported_documents")
    .select("id, file_name, storage_path")
    .eq("request_id", id)
    .is("replaced_at", null)
    .maybeSingle();
  if (!doc) notFound();
  const { data: file, error } = await db.storage
    .from("records")
    .download(doc.storage_path);
  if (error || !file) notFound();
  // Logged before the file is handed over.
  const logged = await db.rpc("log_imported_document_download", {
    p_document_id: doc.id,
  });
  if (logged.error) notFound();
  // A header carries plain ASCII only: anything else becomes "_".
  const name = doc.file_name.replace(/[^\x20-\x7e]|["\\]/g, "_");
  return new Response(file, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

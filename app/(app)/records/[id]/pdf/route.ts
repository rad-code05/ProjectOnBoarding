import type { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth";
import { PAGES } from "@/lib/navigation";
import {
  ensureRecordPdf,
  logRecordDownload,
  readRecordPdf,
} from "@/lib/records/ensure";

/**
 * GET /records/<request id>/pdf — the PDF record of a closed request
 * (admin, approver, auditor). Made once from the approval snapshot, checked
 * against its fingerprint on every download, each download audited.
 * ?view=1 opens it in the browser (Preview) instead of saving it.
 */
export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/records/[id]/pdf">,
) {
  await requireRole(...PAGES.records.roles);
  const { id } = await ctx.params;

  const record = await ensureRecordPdf(id);
  if (!record) {
    return new Response("No PDF record for this request.", { status: 404 });
  }
  const bytes = await readRecordPdf(record);
  await logRecordDownload(record.requestId);

  const inline = request.nextUrl.searchParams.get("view") === "1";
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(bytes.length),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${record.fileName}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Record-SHA256": record.sha256,
    },
  });
}

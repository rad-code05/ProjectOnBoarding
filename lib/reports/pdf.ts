import "server-only";
import { renderToBuffer } from "@react-pdf/renderer";
import { readPdfLogo, registerPdfFonts } from "@/lib/pdf/fonts";
import { formatDayTime } from "@/lib/requests/format";
import { personName } from "@/lib/requests/labels";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ReportPdf, type ReportPdfInput } from "./ReportPdf";

/** "Raju Bholani" and "16 Oct 2026, 09:12 (Dubai)" for the PDF's "Made by" line. */
export async function madeBy(userId: string, timeZone: string) {
  const supabase = createServerSupabaseClient();
  const { data } = await supabase
    .from("app_users")
    .select("first_name, last_name, email")
    .eq("clerk_user_id", userId)
    .maybeSingle();
  const city = (timeZone.split("/").at(-1) ?? timeZone).replaceAll("_", " ");
  return {
    generatedBy:
      personName(data?.first_name, data?.last_name) || data?.email || "—",
    generatedAt: `${formatDayTime(new Date().toISOString(), timeZone)} (${city})`,
  };
}

/** Renders a report PDF (A4; fonts and logo as in the PDF record). */
export async function renderReportPdf(input: ReportPdfInput): Promise<Buffer> {
  registerPdfFonts();
  const logo = await readPdfLogo();
  // Called as a function so the root element is the <Document> itself.
  return renderToBuffer(ReportPdf({ input, logo }));
}

/** Response headers for a downloaded report file. */
export function fileHeaders(
  contentType: string,
  fileName: string,
): HeadersInit {
  return {
    "Content-Type": contentType,
    "Content-Disposition": `attachment; filename="${fileName}"`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
}

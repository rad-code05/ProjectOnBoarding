import type { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { PAGES } from "@/lib/navigation";
import {
  customCsv,
  customFileName,
  customPdfSections,
} from "@/lib/reports/custom/export";
import { loadCustomReport, runCustomReport } from "@/lib/reports/custom/store";
import { fileHeaders, madeBy, renderReportPdf } from "@/lib/reports/pdf";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { companyTimezone } from "@/lib/time/display";

/**
 * GET /reports/custom/<id>/export[?format=pdf] — one of your custom reports
 * as CSV (one file, a Part column) or PDF (a section per part), read again
 * now with your own access. Recorded in the audit log first; no audit
 * entry, no file.
 */
export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/reports/custom/[id]/export">,
) {
  const { userId } = await requireRole(...PAGES.reports.roles);
  const { id } = await ctx.params;
  const format =
    request.nextUrl.searchParams.get("format") === "pdf" ? "pdf" : "csv";
  const report = await loadCustomReport(id);
  if (!report) return new Response("Not found.", { status: 404 });
  if (!report.definition)
    return new Response("This report can't be run.", { status: 409 });

  const timeZone = await companyTimezone();
  const outcomes = await runCustomReport(report.definition, timeZone);
  const rows = outcomes.reduce((n, o) => n + o.result.rows.length, 0);

  const supabase = createServerSupabaseClient();
  const logged = await supabase.rpc("log_report_export", {
    p_report: "custom",
    p_format: format,
    p_filters: { id: report.id, title: report.title, parts: outcomes.length },
    p_rows: rows,
  });
  if (logged.error) {
    return new Response("Could not record the export.", {
      status: logged.error.code === "42501" ? 403 : 500,
    });
  }

  const fileName = customFileName(report.title, format);
  if (format === "pdf") {
    const made = await madeBy(userId, timeZone);
    const city = (timeZone.split("/").at(-1) ?? timeZone).replaceAll("_", " ");
    const sections = customPdfSections(outcomes, timeZone);
    const pdf = await renderReportPdf({
      title: report.title,
      group: "Custom report · made with the assistant",
      definition:
        'Built from the report data you\'re allowed to see; each part says how. Dates are company-time days; "Onboarded" = closed by the approver.',
      period: `Data as of the export (company time, ${city})`,
      filters: [],
      ...made,
      landscape: sections.some((x) => x.table.columns.length > 5),
      sections,
      table: { columns: [], rows: [] },
      empty: "",
    });
    return new Response(new Uint8Array(pdf), {
      headers: fileHeaders("application/pdf", fileName),
    });
  }

  const { header, body } = customCsv(outcomes, timeZone);
  return new Response(toCsv(header, body), {
    headers: fileHeaders("text/csv; charset=utf-8", fileName),
  });
}

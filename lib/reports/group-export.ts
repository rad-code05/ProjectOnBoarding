import "server-only";
import type { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { PAGES } from "@/lib/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { companyTimezone } from "@/lib/time/display";
import { loadReportOptions } from "./all-users";
import { reportInfo } from "./catalog";
import { exportFileName, exportFilters } from "./export";
import {
  filterWords,
  parseReportFilters,
  rangeLabel,
  reportDays,
} from "./filters";
import { groupTiles, type ReportGroup } from "./groups";
import { loadOnboardedBy } from "./onboarded-by";
import { fileHeaders, madeBy, renderReportPdf } from "./pdf";

/**
 * GET /reports/onboarded-by-<group>/export?<filters>[&format=pdf] — one row
 * per country / department as CSV (default) or PDF. Recorded in the audit
 * log first ("report.exported"); no audit entry, no file.
 */
export async function exportOnboardedBy(
  request: NextRequest,
  group: ReportGroup,
): Promise<Response> {
  const { userId } = await requireRole(...PAGES.reports.roles);
  const params = request.nextUrl.searchParams;
  const format = params.get("format") === "pdf" ? "pdf" : "csv";
  const filters = {
    ...parseReportFilters(Object.fromEntries(params)),
    type: null,
    q: "",
  };
  const timeZone = await companyTimezone();
  const slug =
    group === "country" ? "onboarded-by-country" : "onboarded-by-department";
  const info = reportInfo(slug);
  let report;
  try {
    report = await loadOnboardedBy(group, filters, timeZone);
  } catch {
    return new Response("Could not export the report.", { status: 500 });
  }

  const supabase = createServerSupabaseClient();
  const logged = await supabase.rpc("log_report_export", {
    p_report: info.key,
    p_format: format,
    p_filters: exportFilters(filters, timeZone),
    p_rows: report.rows.length,
  });
  if (logged.error) {
    return new Response("Could not record the export.", {
      status: logged.error.code === "42501" ? 403 : 500,
    });
  }

  const days = reportDays(filters, timeZone);
  const tiles = groupTiles(report.rows, group);
  if (format === "pdf") {
    const [options, made] = await Promise.all([
      loadReportOptions(),
      madeBy(userId, timeZone),
    ]);
    const city = (timeZone.split("/").at(-1) ?? timeZone).replaceAll("_", " ");
    const pdf = await renderReportPdf({
      title: info.name,
      group: info.group,
      definition: info.definition,
      period: `${rangeLabel(days)} (company time, ${city})`,
      filters: filterWords(
        filters,
        Object.fromEntries(options.departments.map((d) => [d.id, d.name])),
      ),
      ...made,
      tiles: [
        {
          label: tiles.words.label,
          value: String(tiles.groups),
          note: "with at least one onboarding",
        },
        {
          label: "Most onboardings",
          value: String(tiles.top?.value ?? 0),
          note: tiles.top?.note ?? "—",
        },
      ],
      table: {
        columns: [
          { label: tiles.words.column, width: 3 },
          { label: "Onboarded", width: 1, align: "right" },
          { label: "Share", width: 1, align: "right" },
        ],
        rows: report.rows.map((r) => [r.label, String(r.onboarded), r.share]),
        total: ["Total", String(report.total), "100%"],
      },
      empty: "No onboardings in this period.",
    });
    return new Response(new Uint8Array(pdf), {
      headers: fileHeaders(
        "application/pdf",
        exportFileName(slug, days, "pdf"),
      ),
    });
  }

  const csv = toCsv(
    [tiles.words.column, "Onboarded", "Share"],
    [
      ...report.rows.map((r) => [r.label, r.onboarded, r.share]),
      ["Total", report.total, "100%"],
    ],
  );
  return new Response(csv, {
    headers: fileHeaders(
      "text/csv; charset=utf-8",
      exportFileName(slug, days, "csv"),
    ),
  });
}

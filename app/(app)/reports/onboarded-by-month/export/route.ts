import type { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { PAGES } from "@/lib/navigation";
import { loadReportOptions } from "@/lib/reports/all-users";
import { reportInfo } from "@/lib/reports/catalog";
import { exportFileName } from "@/lib/reports/export";
import { filterWords, parseReportFilters } from "@/lib/reports/filters";
import { monthLabel, monthLetter, summarise } from "@/lib/reports/months";
import { loadOnboardedByMonth } from "@/lib/reports/onboarded";
import { fileHeaders, madeBy, renderReportPdf } from "@/lib/reports/pdf";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { companyTimezone } from "@/lib/time/display";

/**
 * GET /reports/onboarded-by-month/export?<filters>[&format=pdf] — one row
 * per month as CSV (default) or PDF with tiles, chart and table (admins,
 * approvers, auditors). Recorded in the audit log first
 * ("report.exported"); no audit entry, no file.
 */
export async function GET(request: NextRequest) {
  const { userId } = await requireRole(...PAGES.reports.roles);
  const params = request.nextUrl.searchParams;
  const format = params.get("format") === "pdf" ? "pdf" : "csv";
  const filters = {
    ...parseReportFilters(Object.fromEntries(params)),
    type: null,
    q: "",
  };
  const timeZone = await companyTimezone();
  let report;
  try {
    report = await loadOnboardedByMonth(filters, timeZone);
  } catch {
    return new Response("Could not export the report.", { status: 500 });
  }
  const { span, months } = report;

  const supabase = createServerSupabaseClient();
  const logged = await supabase.rpc("log_report_export", {
    p_report: "onboarded_by_month",
    p_format: format,
    // The months really exported (whole calendar months).
    p_filters: {
      from: span.first.slice(0, 7),
      to: span.last.slice(0, 7),
      country: filters.country,
      department: filters.department,
    },
    p_rows: months.length,
  });
  if (logged.error) {
    return new Response("Could not record the export.", {
      status: logged.error.code === "42501" ? 403 : 500,
    });
  }

  const { total, busiest } = summarise(months);
  const name = (ext: "csv" | "pdf") =>
    exportFileName(
      "onboarded-by-month",
      { first: span.first.slice(0, 7), last: span.last.slice(0, 7) },
      ext,
    );

  if (format === "pdf") {
    const [options, made] = await Promise.all([
      loadReportOptions(),
      madeBy(userId, timeZone),
    ]);
    const info = reportInfo("onboarded-by-month");
    const period = `${monthLabel(span.first)} – ${monthLabel(span.last)}`;
    const city = (timeZone.split("/").at(-1) ?? timeZone).replaceAll("_", " ");
    const pdf = await renderReportPdf({
      title: info.name,
      group: info.group,
      definition: info.definition,
      period: `${period} (whole months, company time, ${city})`,
      filters: filterWords(
        filters,
        Object.fromEntries(options.departments.map((d) => [d.id, d.name])),
      ),
      ...made,
      tiles: [
        {
          label: "This month",
          value: String(report.thisMonth.onboarded),
          note: `${monthLabel(report.thisMonth.month)}, so far`,
        },
        { label: "In this period", value: String(total), note: period },
        {
          label: "Busiest month",
          value: String(busiest?.onboarded ?? 0),
          note: busiest ? monthLabel(busiest.month) : "—",
        },
      ],
      chart: {
        title: "Onboarded per month",
        bars: months.map((m) => ({
          label:
            months.length <= 12
              ? monthLetter(m.month)
              : m.month.slice(5, 7) === "01"
                ? m.month.slice(0, 4)
                : "",
          value: m.onboarded,
        })),
      },
      table: {
        columns: [
          { label: "Month", width: 3 },
          { label: "Onboarded", width: 1, align: "right" },
        ],
        rows: months
          .slice()
          .reverse()
          .map((m) => [monthLabel(m.month), String(m.onboarded)]),
        total: ["Total", String(total)],
      },
      empty: "No months in this period.",
    });
    return new Response(new Uint8Array(pdf), {
      headers: fileHeaders("application/pdf", name("pdf")),
    });
  }

  const csv = toCsv(
    ["Month", "Onboarded"],
    [
      ...months.map((m) => [monthLabel(m.month), m.onboarded]),
      ["Total", total],
    ],
  );
  return new Response(csv, {
    headers: fileHeaders("text/csv; charset=utf-8", name("csv")),
  });
}

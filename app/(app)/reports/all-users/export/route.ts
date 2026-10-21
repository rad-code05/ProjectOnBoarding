import type { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { PAGES } from "@/lib/navigation";
import {
  allUsersArgs,
  loadReportOptions,
  officeText,
} from "@/lib/reports/all-users";
import { reportInfo } from "@/lib/reports/catalog";
import { exportFileName, exportFilters } from "@/lib/reports/export";
import {
  filterWords,
  reportNames,
  parseReportFilters,
  rangeLabel,
  reportDays,
} from "@/lib/reports/filters";
import { fileHeaders, madeBy, renderReportPdf } from "@/lib/reports/pdf";
import { formatDate, formatDay, formatDayTime } from "@/lib/requests/format";
import {
  STATE_LABELS,
  TYPE_LABELS,
  countryName,
  personName,
} from "@/lib/requests/labels";
import { nationalityText } from "@/lib/requests/signing";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { companyTimezone } from "@/lib/time/display";

/** Every row the report can export at once. */
const EXPORT_LIMIT = 10_000;

/**
 * GET /reports/all-users/export?<the report's filters>[&format=pdf] — the
 * All users list as CSV (default) or PDF (admins, approvers, auditors). The
 * export is written to the audit log first ("report.exported"); no audit
 * entry, no file.
 */
export async function GET(request: NextRequest) {
  const { userId } = await requireRole(...PAGES.reports.roles);
  const params = request.nextUrl.searchParams;
  const format = params.get("format") === "pdf" ? "pdf" : "csv";
  const filters = parseReportFilters(Object.fromEntries(params));
  const timeZone = await companyTimezone();
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.rpc("report_all_users", {
    ...allUsersArgs(filters, timeZone),
    p_limit: EXPORT_LIMIT,
  });
  if (error) {
    return new Response("Could not export the report.", {
      status: error.code === "42501" ? 403 : 500,
    });
  }
  const rows = data ?? [];

  const logged = await supabase.rpc("log_report_export", {
    p_report: "all_users",
    p_format: format,
    p_filters: exportFilters(filters, timeZone),
    p_rows: rows.length,
  });
  if (logged.error) {
    return new Response("Could not record the export.", { status: 500 });
  }

  const days = reportDays(filters, timeZone);
  if (format === "pdf") {
    const [options, made] = await Promise.all([
      loadReportOptions(),
      madeBy(userId, timeZone),
    ]);
    const info = reportInfo("all-users");
    const city = (timeZone.split("/").at(-1) ?? timeZone).replaceAll("_", " ");
    const pdf = await renderReportPdf({
      title: info.name,
      group: info.group,
      definition: info.definition,
      period: `${rangeLabel(days)} (company time, ${city})`,
      filters: filterWords(filters, reportNames(options)),
      ...made,
      landscape: true,
      table: {
        columns: [
          { label: "Ticket", width: 1.3 },
          { label: "Name", width: 1.4 },
          { label: "Work email", width: 2 },
          { label: "Type", width: 1.2 },
          { label: "Status", width: 1.2 },
          { label: "Department", width: 1.1 },
          { label: "Country", width: 1 },
          { label: "Office", width: 1.3 },
          { label: "Nationality", width: 1.1 },
          { label: "Effective / last day", width: 1.1 },
          { label: "Closed", width: 1 },
        ],
        rows: rows.map((r) => [
          r.ticket_id,
          personName(r.first_name, r.last_name) || "—",
          r.work_email ?? "—",
          TYPE_LABELS[r.type],
          STATE_LABELS[r.state],
          r.department ?? "—",
          r.country ? countryName(r.country) : "—",
          officeText(r.office, r.location) ?? "—",
          nationalityText(r.nationalities) || "—",
          formatDate(
            r.type === "offboarding" ? r.last_working_day : r.effective_date,
          ),
          r.closed_at ? formatDay(r.closed_at, timeZone) : "—",
        ]),
      },
      empty: "No requests match these filters.",
    });
    return new Response(new Uint8Array(pdf), {
      headers: fileHeaders(
        "application/pdf",
        exportFileName("all-users", days, "pdf"),
      ),
    });
  }

  const csv = toCsv(
    [
      "Ticket",
      "Type",
      "Status",
      "First name",
      "Last name",
      "Work email",
      "Department",
      "Country",
      "Office",
      "Location",
      "Nationality",
      "Effective date",
      "Last working day",
      "Created",
      "Closed",
    ],
    rows.map((r) => [
      r.ticket_id,
      TYPE_LABELS[r.type],
      STATE_LABELS[r.state],
      r.first_name,
      r.last_name,
      r.work_email,
      r.department,
      r.country ? countryName(r.country) : null,
      r.office,
      r.location,
      nationalityText(r.nationalities) || null,
      r.effective_date,
      r.last_working_day,
      formatDayTime(r.created_at, timeZone),
      r.closed_at ? formatDayTime(r.closed_at, timeZone) : null,
    ]),
  );
  return new Response(csv, {
    headers: fileHeaders(
      "text/csv; charset=utf-8",
      exportFileName("all-users", days, "csv"),
    ),
  });
}

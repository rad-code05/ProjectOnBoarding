import type { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { PAGES } from "@/lib/navigation";
import { allUsersArgs } from "@/lib/reports/all-users";
import { exportFilters, exportFileName } from "@/lib/reports/export";
import { parseReportFilters, reportDays } from "@/lib/reports/filters";
import { STATE_LABELS, TYPE_LABELS, countryName } from "@/lib/requests/labels";
import { formatDayTime } from "@/lib/requests/format";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { companyTimezone } from "@/lib/time/display";

/** Every row the report can export at once. */
const EXPORT_LIMIT = 10_000;

/**
 * GET /reports/all-users/export?<the report's filters> — the All users list
 * as CSV (admins, approvers, auditors). The export is written to the audit
 * log first ("report.exported"); no audit entry, no file.
 */
export async function GET(request: NextRequest) {
  await requireRole(...PAGES.reports.roles);
  const filters = parseReportFilters(
    Object.fromEntries(request.nextUrl.searchParams),
  );
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
    p_format: "csv",
    p_filters: exportFilters(filters, timeZone),
    p_rows: rows.length,
  });
  if (logged.error) {
    return new Response("Could not record the export.", { status: 500 });
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
      r.effective_date,
      r.last_working_day,
      formatDayTime(r.created_at, timeZone),
      r.closed_at ? formatDayTime(r.closed_at, timeZone) : null,
    ]),
  );
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportFileName("all-users", reportDays(filters, timeZone), "csv")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

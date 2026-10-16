import type { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { PAGES } from "@/lib/navigation";
import { exportFileName } from "@/lib/reports/export";
import { parseReportFilters } from "@/lib/reports/filters";
import { monthLabel, summarise } from "@/lib/reports/months";
import { onboardedMonths, onboardedSpan } from "@/lib/reports/onboarded";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { companyTimezone } from "@/lib/time/display";

/**
 * GET /reports/onboarded-by-month/export?<filters> — one row per month as
 * CSV (admins, approvers, auditors). Recorded in the audit log first
 * ("report.exported"); no audit entry, no file.
 */
export async function GET(request: NextRequest) {
  await requireRole(...PAGES.reports.roles);
  const filters = {
    ...parseReportFilters(Object.fromEntries(request.nextUrl.searchParams)),
    type: null,
    q: "",
  };
  const timeZone = await companyTimezone();
  let span;
  let months;
  try {
    span = await onboardedSpan(filters, timeZone);
    months = await onboardedMonths(span, filters);
  } catch {
    return new Response("Could not export the report.", { status: 500 });
  }

  const supabase = createServerSupabaseClient();
  const logged = await supabase.rpc("log_report_export", {
    p_report: "onboarded_by_month",
    p_format: "csv",
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

  const csv = toCsv(
    ["Month", "Onboarded"],
    [
      ...months.map((m) => [monthLabel(m.month), m.onboarded]),
      ["Total", summarise(months).total],
    ],
  );
  const name = exportFileName(
    "onboarded-by-month",
    { first: span.first.slice(0, 7), last: span.last.slice(0, 7) },
    "csv",
  );
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

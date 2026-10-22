import type { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { PAGES } from "@/lib/navigation";
import { loadReportOptions } from "@/lib/reports/all-users";
import { reportInfo } from "@/lib/reports/catalog";
import { employeePlace, officeLines } from "@/lib/reports/employees";
import { employeesArgs } from "@/lib/reports/employees-load";
import {
  filterWords,
  parseReportFilters,
  reportNames,
} from "@/lib/reports/filters";
import { fileHeaders, madeBy, renderReportPdf } from "@/lib/reports/pdf";
import { formatDay } from "@/lib/requests/format";
import { countryName } from "@/lib/requests/labels";
import { nationalityText } from "@/lib/requests/signing";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { companyTimezone } from "@/lib/time/display";

/** Every row the report can export at once. */
const EXPORT_LIMIT = 10_000;

/**
 * GET /reports/employees-by-office/export?<filters>[&format=pdf] — the
 * headcount today: CSV = every employee with office, location, country and
 * nationality; PDF = the tiles and the table per office · state · city.
 * Recorded in the audit log first; no audit entry, no file.
 */
export async function GET(request: NextRequest) {
  const { userId } = await requireRole(...PAGES.reports.roles);
  const params = request.nextUrl.searchParams;
  const format = params.get("format") === "pdf" ? "pdf" : "csv";
  const filters = {
    ...parseReportFilters(Object.fromEntries(params)),
    type: null,
  };
  const timeZone = await companyTimezone();
  const supabase = createServerSupabaseClient();
  const [people, offices] = await Promise.all([
    supabase.rpc("report_employees", {
      ...employeesArgs(filters),
      p_search: filters.q || undefined,
      p_limit: EXPORT_LIMIT,
    }),
    supabase.rpc("report_employees_by_office", employeesArgs(filters)),
  ]);
  const error = people.error ?? offices.error;
  if (error) {
    return new Response("Could not export the report.", {
      status: error.code === "42501" ? 403 : 500,
    });
  }
  const rows = people.data ?? [];
  const { lines, totals } = officeLines(offices.data ?? []);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone }).format(
    new Date(),
  );

  const logged = await supabase.rpc("log_report_export", {
    p_report: "employees_by_office",
    p_format: format,
    p_filters: {
      as_of: today,
      country: filters.country,
      department: filters.department,
      office: filters.office,
      state: filters.region,
      city: filters.city,
      nationality: filters.nationality,
      search: filters.q || null,
    },
    p_rows: format === "pdf" ? lines.length : rows.length,
  });
  if (logged.error) {
    return new Response("Could not record the export.", { status: 500 });
  }

  const fileName = (ext: "csv" | "pdf") =>
    `employees-by-office_${today}.${ext}`;

  if (format === "pdf") {
    const [options, made] = await Promise.all([
      loadReportOptions(),
      madeBy(userId, timeZone),
    ]);
    const info = reportInfo("employees-by-office");
    const city = (timeZone.split("/").at(-1) ?? timeZone).replaceAll("_", " ");
    const pdf = await renderReportPdf({
      title: info.name,
      group: info.group,
      definition: info.definition,
      period: `As of ${formatDay(new Date().toISOString(), timeZone)} (company time, ${city})`,
      filters: filterWords(filters, reportNames(options)),
      ...made,
      tiles: [
        { label: "Employees", value: String(totals.employees), note: "today" },
        {
          label: "Biggest office",
          value: String(totals.biggest?.value ?? 0),
          note: totals.biggest?.note ?? "—",
        },
        {
          label: "Leaving",
          value: String(totals.leaving),
          note: "offboarding open",
        },
      ],
      table: {
        columns: [
          { label: "Office", width: 3 },
          { label: "Employees", width: 1, align: "right" },
          { label: "Leaving", width: 1, align: "right" },
          { label: "Share", width: 1, align: "right" },
        ],
        rows: lines.map((l) => [
          l.sub ? `    ${l.label}` : l.label,
          String(l.employees),
          String(l.leaving),
          l.share,
        ]),
        total: [
          "Total",
          String(totals.employees),
          String(totals.leaving),
          "100%",
        ],
      },
      empty: "Nobody employed today matches these filters.",
    });
    return new Response(new Uint8Array(pdf), {
      headers: fileHeaders("application/pdf", fileName("pdf")),
    });
  }

  const csv = toCsv(
    [
      "Office",
      "State",
      "City",
      "First name",
      "Last name",
      "Work email",
      "Department",
      "Country (works in)",
      "Nationality",
      "Onboarded",
      "Latest record",
      "Leaving (open offboarding)",
    ],
    rows.map((r) => [
      r.office ? r.office : employeePlace(r),
      r.region,
      r.city,
      r.first_name,
      r.last_name,
      r.work_email,
      r.department,
      r.country ? countryName(r.country) : null,
      nationalityText(r.nationalities) || null,
      r.onboarded_at ? formatDay(r.onboarded_at, timeZone) : null,
      r.latest_ticket_id,
      r.leaving_ticket_id,
    ]),
  );
  return new Response(csv, {
    headers: fileHeaders("text/csv; charset=utf-8", fileName("csv")),
  });
}

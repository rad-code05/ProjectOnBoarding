import type { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { PAGES } from "@/lib/navigation";
import {
  ACCESS_KIND_INFO,
  accessFileName,
  accessHolder,
  accessTotals,
  parseAccessKind,
  parseItemKey,
} from "@/lib/reports/access";
import { accessArgs } from "@/lib/reports/access-load";
import { loadReportOptions } from "@/lib/reports/all-users";
import { reportInfo } from "@/lib/reports/catalog";
import {
  filterWords,
  parseReportFilters,
  reportNames,
} from "@/lib/reports/filters";
import { fileHeaders, madeBy, renderReportPdf } from "@/lib/reports/pdf";
import { formatDay } from "@/lib/requests/format";
import { countryName, personName } from "@/lib/requests/labels";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { companyTimezone } from "@/lib/time/display";

/** Every row the report can export at once. */
const EXPORT_LIMIT = 10_000;

/**
 * GET /reports/access-by-application/export?kind=…[&item=…][&filters]
 * [&format=pdf] — who holds what today, one line per person and item (all
 * items of the tab, or one), as CSV or PDF (admins, approvers, auditors).
 * Recorded in the audit log first; no audit entry, no file.
 */
export async function GET(request: NextRequest) {
  const { userId, roles } = await requireRole(...PAGES.reports.roles);
  const params = request.nextUrl.searchParams;
  const format = params.get("format") === "pdf" ? "pdf" : "csv";
  const kind = parseAccessKind(params.get("kind") ?? undefined);
  const item = parseItemKey(params.get("item") ?? undefined);
  const filters = {
    ...parseReportFilters(Object.fromEntries(params)),
    type: null,
  };
  const timeZone = await companyTimezone();
  const supabase = createServerSupabaseClient();
  const [holders, items] = await Promise.all([
    supabase.rpc("report_access_holders", {
      ...accessArgs(kind, filters),
      p_item_key: item ?? undefined,
      p_limit: EXPORT_LIMIT,
    }),
    supabase.rpc("report_access_by_item", accessArgs(kind, filters)),
  ]);
  const error = holders.error ?? items.error;
  if (error) {
    return new Response("Could not export the report.", {
      status: error.code === "42501" ? 403 : 500,
    });
  }
  const raw = holders.data ?? [];
  const today = new Intl.DateTimeFormat("en-CA", { timeZone }).format(
    new Date(),
  );

  const logged = await supabase.rpc("log_report_export", {
    p_report: "access_by_application",
    p_format: format,
    p_filters: {
      as_of: today,
      kind,
      item,
      country: filters.country,
      department: filters.department,
      search: filters.q || null,
    },
    p_rows: raw.length,
  });
  if (logged.error) {
    return new Response("Could not record the export.", { status: 500 });
  }

  const info = ACCESS_KIND_INFO[kind];
  const itemName = item ? (raw[0]?.name ?? null) : null;
  const fileName = (ext: "csv" | "pdf") =>
    accessFileName(kind, itemName, today, ext);
  const options = {
    timeZone,
    canOpenRequests: PAGES.requests.roles.some((x) => roles.includes(x)),
    isApprover: roles.includes("approver"),
  };
  const rows = raw.map((r) => accessHolder(r, kind, options));

  if (format === "pdf") {
    const [reportOptions, made] = await Promise.all([
      loadReportOptions(),
      madeBy(userId, timeZone),
    ]);
    const report = reportInfo("access-by-application");
    const totals = accessTotals(items.data ?? []);
    const city = (timeZone.split("/").at(-1) ?? timeZone).replaceAll("_", " ");
    const pdf = await renderReportPdf({
      title: itemName ? `${report.name} · ${itemName}` : report.name,
      group: report.group,
      definition: report.definition,
      period: `As of ${formatDay(new Date().toISOString(), timeZone)} (company time, ${city}) · ${info.tab}`,
      filters: filterWords(filters, reportNames(reportOptions)),
      ...made,
      landscape: true,
      tiles: itemName
        ? [
            {
              label: "People",
              value: String(raw.length),
              note: `hold ${itemName} today`,
            },
          ]
        : [
            {
              label: "People with access",
              value: String(totals.people),
              note: `${totals.rights} held in all`,
            },
            {
              label: `${info.tab} in use`,
              value: String(totals.inUse),
              note: `of ${totals.catalog} in the catalog`,
            },
            {
              label: "Leaving",
              value: String(totals.leaving),
              note: "offboarding open, still hold access",
            },
          ],
      table: {
        columns: [
          { label: info.tab.replace(/s$/, ""), width: 1.4 },
          { label: "Name", width: 1.4 },
          { label: "Work email", width: 2 },
          { label: info.detail, width: 1.4 },
          { label: "Since", width: 1 },
          { label: "Granted by", width: 1.3 },
          { label: "Leaving", width: 1.3 },
        ],
        rows: rows.map((r, i) => [
          raw[i].name,
          r.name,
          raw[i].work_email,
          r.detail,
          r.since,
          r.grantedBy,
          r.leaving ? r.leaving.ticketId : "",
        ]),
      },
      empty: "Nobody holds anything matching these filters today.",
    });
    return new Response(new Uint8Array(pdf), {
      headers: fileHeaders("application/pdf", fileName("pdf")),
    });
  }

  const csv = toCsv(
    [
      info.tab.replace(/s$/, ""),
      "Category",
      "Name",
      "Work email",
      "Department",
      "Country",
      info.detail,
      "Description",
      "Since",
      "Granted by",
      "Source",
      "Leaving (open offboarding)",
    ],
    raw.map((r, i) => [
      r.name,
      r.category_name,
      personName(r.first_name, r.last_name),
      r.work_email,
      r.department,
      r.country ? countryName(r.country) : null,
      kind === "equipment" ? r.asset_tag : r.permission,
      r.description,
      rows[i].since,
      r.granted_ticket_id,
      r.source === "import" ? "Excel import" : "Request",
      r.leaving_ticket_id,
    ]),
  );
  return new Response(csv, {
    headers: fileHeaders("text/csv; charset=utf-8", fileName("csv")),
  });
}

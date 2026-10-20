import type { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { PAGES } from "@/lib/navigation";
import { reportInfo } from "@/lib/reports/catalog";
import { filterWords, parseReportFilters } from "@/lib/reports/filters";
import { OPEN_STATES, openRow, openSummary } from "@/lib/reports/open";
import { openArgs } from "@/lib/reports/open-load";
import { fileHeaders, madeBy, renderReportPdf } from "@/lib/reports/pdf";
import { formatDayTime } from "@/lib/requests/format";
import { STATE_LABELS, TYPE_LABELS, personName } from "@/lib/requests/labels";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { companyTimezone } from "@/lib/time/display";

/**
 * GET /reports/open-requests/export?<search, type>[&format=pdf] — every open
 * request right now, as CSV or PDF (admins, approvers, auditors). Recorded
 * in the audit log first; no audit entry, no file.
 */
export async function GET(request: NextRequest) {
  const { userId, roles } = await requireRole(...PAGES.reports.roles);
  const params = request.nextUrl.searchParams;
  const format = params.get("format") === "pdf" ? "pdf" : "csv";
  const filters = {
    ...parseReportFilters(Object.fromEntries(params)),
    country: null,
    department: null,
  };
  const timeZone = await companyTimezone();
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.rpc(
    "report_open_requests",
    openArgs(filters),
  );
  if (error) {
    return new Response("Could not export the report.", {
      status: error.code === "42501" ? 403 : 500,
    });
  }
  const raw = data ?? [];
  const today = new Intl.DateTimeFormat("en-CA", { timeZone }).format(
    new Date(),
  );

  const logged = await supabase.rpc("log_report_export", {
    p_report: "open_requests",
    p_format: format,
    p_filters: { as_of: today, type: filters.type, search: filters.q || null },
    p_rows: raw.length,
  });
  if (logged.error) {
    return new Response("Could not record the export.", { status: 500 });
  }

  const now = new Date();
  const rows = raw.map((r) =>
    openRow(r, {
      timeZone,
      now,
      canOpenRequests: PAGES.requests.roles.some((x) => roles.includes(x)),
      isApprover: roles.includes("approver"),
    }),
  );
  const waitsFor = (state: string) =>
    OPEN_STATES.find((s) => s.state === state)?.with ?? "";
  const fileName = (ext: "csv" | "pdf") => `open-requests_${today}.${ext}`;

  if (format === "pdf") {
    const made = await madeBy(userId, timeZone);
    const info = reportInfo("open-requests");
    const summary = openSummary(raw, rows);
    const city = (timeZone.split("/").at(-1) ?? timeZone).replaceAll("_", " ");
    // Board order, longest waiting first within each status.
    const ordered = summary.groups.flatMap((g) => g.rows);
    const pdf = await renderReportPdf({
      title: info.name,
      group: info.group,
      definition: info.definition,
      period: `Right now — ${formatDayTime(now.toISOString(), timeZone)} (company time, ${city})`,
      filters: filterWords(filters, {}),
      ...made,
      landscape: true,
      tiles: [
        {
          label: "Open",
          value: String(summary.total),
          note: `${summary.withIt} with IT, ${summary.withApprover} with the approver`,
        },
        {
          label: "Longest waiting",
          value: summary.longest?.waiting ?? "—",
          note: summary.longest?.title.toLowerCase() ?? "",
        },
        {
          label: "Offboardings",
          value: String(summary.offboardings),
          note: summary.overdue ? `${summary.overdue} overdue` : "none overdue",
        },
      ],
      table: {
        columns: [
          { label: "Status", width: 1.5 },
          { label: "Waiting for", width: 1.2 },
          { label: "Ticket", width: 1.3 },
          { label: "Name", width: 1.5 },
          { label: "Waiting", width: 0.9 },
          { label: "Opened", width: 1 },
          { label: "SLA", width: 1.1 },
        ],
        rows: ordered.map((r) => [
          STATE_LABELS[r.state],
          waitsFor(r.state),
          r.subtitle.split(" · ")[0],
          r.name,
          r.waiting,
          r.opened,
          r.sla ?? "",
        ]),
      },
      empty: "Nothing is waiting right now.",
    });
    return new Response(new Uint8Array(pdf), {
      headers: fileHeaders("application/pdf", fileName("pdf")),
    });
  }

  const at = (iso: string | null) =>
    iso ? formatDayTime(iso, timeZone) : null;
  const csv = toCsv(
    [
      "Ticket",
      "Type",
      "Status",
      "Waiting for",
      "Name",
      "Work email",
      "Opened",
      "In this status since",
      "Waiting (hours)",
      "SLA deadline",
      "SLA",
    ],
    raw.map((r, i) => [
      r.ticket_id,
      TYPE_LABELS[r.type],
      STATE_LABELS[r.state],
      waitsFor(r.state),
      personName(r.first_name, r.last_name),
      r.work_email,
      at(r.created_at),
      at(r.waiting_since),
      (rows[i].waitingSeconds / 3600).toFixed(1),
      at(r.sla_due_at),
      rows[i].sla,
    ]),
  );
  return new Response(csv, {
    headers: fileHeaders("text/csv; charset=utf-8", fileName("csv")),
  });
}

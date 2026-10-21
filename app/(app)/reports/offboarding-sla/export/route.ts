import type { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { PAGES } from "@/lib/navigation";
import { loadReportOptions } from "@/lib/reports/all-users";
import { reportInfo } from "@/lib/reports/catalog";
import { exportFileName, exportFilters } from "@/lib/reports/export";
import {
  filterWords,
  reportNames,
  parseReportFilters,
  rangeLabel,
  reportDays,
} from "@/lib/reports/filters";
import { slaArgs } from "@/lib/reports/offboarding-sla";
import { fileHeaders, madeBy, renderReportPdf } from "@/lib/reports/pdf";
import { slaReportRow, slaSummary, timelineLabel } from "@/lib/reports/sla";
import { formatDayTime } from "@/lib/requests/format";
import { STATE_LABELS, personName } from "@/lib/requests/labels";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { companyTimezone } from "@/lib/time/display";

/** Every row the report can export at once. */
const EXPORT_LIMIT = 10_000;

/**
 * GET /reports/offboarding-sla/export?<filters>[&format=pdf] — the
 * Offboarding SLA as CSV (with the missed reason) or PDF (admins,
 * approvers, auditors). Recorded in the audit log first; no audit entry, no
 * file.
 */
export async function GET(request: NextRequest) {
  const { userId, roles } = await requireRole(...PAGES.reports.roles);
  const params = request.nextUrl.searchParams;
  const format = params.get("format") === "pdf" ? "pdf" : "csv";
  const filters = {
    ...parseReportFilters(Object.fromEntries(params)),
    type: null,
  };
  const timeZone = await companyTimezone();
  const supabase = createServerSupabaseClient();
  const args = slaArgs(filters, timeZone);
  const [list, totals] = await Promise.all([
    supabase.rpc("report_offboarding_sla", { ...args, p_limit: EXPORT_LIMIT }),
    supabase.rpc("report_offboarding_sla_summary", args),
  ]);
  const error = list.error ?? totals.error;
  if (error) {
    return new Response("Could not export the report.", {
      status: error.code === "42501" ? 403 : 500,
    });
  }
  const raw = list.data ?? [];

  const logged = await supabase.rpc("log_report_export", {
    p_report: "offboarding_sla",
    p_format: format,
    p_filters: exportFilters(filters, timeZone),
    p_rows: raw.length,
  });
  if (logged.error) {
    return new Response("Could not record the export.", { status: 500 });
  }

  const days = reportDays(filters, timeZone);
  const now = new Date();
  const rows = raw.map((r) =>
    slaReportRow(r, {
      timeZone,
      now,
      canOpenRequests: PAGES.requests.roles.some((x) => roles.includes(x)),
      isApprover: roles.includes("approver"),
    }),
  );

  if (format === "pdf") {
    const [options, made] = await Promise.all([
      loadReportOptions(),
      madeBy(userId, timeZone),
    ]);
    const info = reportInfo("offboarding-sla");
    const summary = slaSummary(totals.data ?? []);
    const city = (timeZone.split("/").at(-1) ?? timeZone).replaceAll("_", " ");
    const pdf = await renderReportPdf({
      title: info.name,
      group: info.group,
      definition: info.definition,
      period: `${rangeLabel(days)} (company time, ${city})`,
      filters: filterWords(filters, reportNames(options)),
      ...made,
      landscape: true,
      tiles: [
        {
          label: "Met on time",
          value: summary.metPercent === null ? "—" : `${summary.metPercent}%`,
          note: summary.decided
            ? `${summary.met} of ${summary.decided} decided`
            : "none decided yet",
        },
        {
          label: "Missed",
          value: String(summary.missed),
          note: "removed after the deadline",
        },
        {
          label: "Still open",
          value: String(summary.open),
          note: summary.overdue ? `${summary.overdue} overdue` : "none overdue",
        },
      ],
      table: {
        columns: [
          { label: "Ticket", width: 1.3 },
          { label: "Name", width: 1.4 },
          { label: "Timeline", width: 1 },
          { label: "Deadline", width: 1.4 },
          { label: "Removals", width: 1.8 },
          { label: "Result", width: 1.1 },
          { label: "Reason / margin", width: 2.4 },
        ],
        rows: rows.map((r, i) => [
          r.ticketId,
          r.name,
          timelineLabel(raw[i].sla_timeline),
          r.deadline,
          r.removals,
          r.result,
          r.note,
        ]),
      },
      empty: "No offboarding deadlines in this period.",
    });
    return new Response(new Uint8Array(pdf), {
      headers: fileHeaders(
        "application/pdf",
        exportFileName("offboarding-sla", days, "pdf"),
      ),
    });
  }

  const at = (iso: string | null) =>
    iso ? formatDayTime(iso, timeZone) : null;
  const csv = toCsv(
    [
      "Ticket",
      "Status",
      "Name",
      "Work email",
      "Timeline",
      "Access cut-off",
      "Deadline",
      "Removals done",
      "Removals total",
      "All removed",
      "Result",
      "Missed reason",
    ],
    raw.map((r, i) => [
      r.ticket_id,
      STATE_LABELS[r.state],
      personName(r.first_name, r.last_name),
      r.work_email,
      timelineLabel(r.sla_timeline),
      at(r.access_cutoff_at),
      at(r.sla_due_at),
      r.removals_done,
      r.removals_total,
      at(r.removed_at),
      rows[i].result,
      r.sla_missed_reason,
    ]),
  );
  return new Response(csv, {
    headers: fileHeaders(
      "text/csv; charset=utf-8",
      exportFileName("offboarding-sla", days, "csv"),
    ),
  });
}

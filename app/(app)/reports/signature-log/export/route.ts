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
import { fileHeaders, madeBy, renderReportPdf } from "@/lib/reports/pdf";
import { signatureArgs } from "@/lib/reports/signature-log";
import { formatDuration, signatureRow } from "@/lib/reports/signatures";
import { formatDayTime } from "@/lib/requests/format";
import { STATE_LABELS, TYPE_LABELS, personName } from "@/lib/requests/labels";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { companyTimezone } from "@/lib/time/display";

/** Every row the report can export at once. */
const EXPORT_LIMIT = 10_000;

/**
 * GET /reports/signature-log/export?<filters>[&format=pdf] — the Signature
 * log as CSV (with both fingerprints) or PDF (admins, approvers,
 * auditors). Recorded in the audit log first; no audit entry, no file.
 */
export async function GET(request: NextRequest) {
  const { userId, roles } = await requireRole(...PAGES.reports.roles);
  const params = request.nextUrl.searchParams;
  const format = params.get("format") === "pdf" ? "pdf" : "csv";
  const filters = parseReportFilters(Object.fromEntries(params));
  const timeZone = await companyTimezone();
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.rpc("report_signature_log", {
    ...signatureArgs(filters, timeZone),
    p_limit: EXPORT_LIMIT,
  });
  if (error) {
    return new Response("Could not export the report.", {
      status: error.code === "42501" ? 403 : 500,
    });
  }
  const raw = data ?? [];

  const logged = await supabase.rpc("log_report_export", {
    p_report: "signature_log",
    p_format: format,
    p_filters: exportFilters(filters, timeZone),
    p_rows: raw.length,
  });
  if (logged.error) {
    return new Response("Could not record the export.", { status: 500 });
  }

  const days = reportDays(filters, timeZone);
  const rows = raw.map((r) =>
    signatureRow(r, {
      timeZone,
      canOpenRequests: PAGES.requests.roles.some((x) => roles.includes(x)),
      isApprover: roles.includes("approver"),
    }),
  );

  if (format === "pdf") {
    const [options, made] = await Promise.all([
      loadReportOptions(),
      madeBy(userId, timeZone),
    ]);
    const info = reportInfo("signature-log");
    const first = raw[0];
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
          label: "Approved",
          value: String(first?.approved_count ?? 0),
          note: `of ${first?.total_count ?? 0} signed by IT`,
        },
        {
          label: "Typical time to approve",
          value:
            first?.median_seconds == null
              ? "—"
              : formatDuration(first.median_seconds),
          note: "median",
        },
        {
          label: "Returned at least once",
          value: String(first?.returned_count ?? 0),
          note: "requests",
        },
      ],
      table: {
        columns: [
          { label: "Ticket", width: 1.3 },
          { label: "Name", width: 1.4 },
          { label: "Status", width: 1.3 },
          { label: "IT signed (first)", width: 2.4 },
          { label: "Approved", width: 2.4 },
          { label: "Time to approve", width: 1.6 },
        ],
        rows: rows.map((r) => [
          r.ticketId,
          r.name,
          STATE_LABELS[r.state],
          r.itSigned,
          r.approved,
          r.timeToApprove,
        ]),
      },
      empty: "Nothing signed by IT in this period.",
    });
    return new Response(new Uint8Array(pdf), {
      headers: fileHeaders(
        "application/pdf",
        exportFileName("signature-log", days, "pdf"),
      ),
    });
  }

  const at = (iso: string | null) =>
    iso ? formatDayTime(iso, timeZone) : null;
  const csv = toCsv(
    [
      "Ticket",
      "Type",
      "Status",
      "Name",
      "Work email",
      "First IT signature",
      "IT signed by",
      "Last IT signature",
      "IT fingerprint (SHA-256)",
      "Approved",
      "Approved by",
      "Approval fingerprint (SHA-256)",
      "Time to approve (hours)",
      "Returns",
      "PDF made",
    ],
    raw.map((r) => [
      r.ticket_id,
      TYPE_LABELS[r.type],
      STATE_LABELS[r.state],
      personName(r.first_name, r.last_name),
      r.work_email,
      at(r.first_signed_at),
      r.first_signed_by,
      at(r.last_signed_at),
      r.it_sha256,
      at(r.approved_at),
      r.approved_by,
      r.final_sha256,
      r.approved_at
        ? (
            (new Date(r.approved_at).getTime() -
              new Date(r.first_signed_at).getTime()) /
            3_600_000
          ).toFixed(1)
        : null,
      r.returns,
      at(r.pdf_generated_at),
    ]),
  );
  return new Response(csv, {
    headers: fileHeaders(
      "text/csv; charset=utf-8",
      exportFileName("signature-log", days, "csv"),
    ),
  });
}

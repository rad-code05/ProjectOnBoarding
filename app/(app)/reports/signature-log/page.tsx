import Link from "next/link";
import { ExportBox } from "@/components/reports/ExportBox";
import { ReportFilterBar } from "@/components/reports/ReportFilterBar";
import { ReportHeader } from "@/components/reports/ReportHeader";
import { SignatureLogList } from "@/components/reports/SignatureLogList";
import { SummaryTile, buttonStyles } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { PAGES } from "@/lib/navigation";
import { loadReportOptions } from "@/lib/reports/all-users";
import { reportInfo } from "@/lib/reports/catalog";
import {
  REPORT_PAGE_SIZE,
  parseReportFilters,
  rangeLabel,
  reportDays,
  reportParams,
} from "@/lib/reports/filters";
import { loadSignatureLog } from "@/lib/reports/signature-log";
import { formatDuration } from "@/lib/reports/signatures";
import { companyTimezone } from "@/lib/time/display";
import { countSignatureLog } from "../actions";

export const metadata = { title: "Signature log" };

/** Report: who signed and approved what, and how fast (board: Phone · Signature log). */
export default async function SignatureLogPage({
  searchParams,
}: PageProps<"/reports/signature-log">) {
  const { roles } = await requireRole(...PAGES.reports.roles);
  const filters = parseReportFilters(await searchParams);
  const timeZone = await companyTimezone();
  const [options, log] = await Promise.all([
    loadReportOptions(),
    loadSignatureLog(filters, {
      timeZone,
      canOpenRequests: PAGES.requests.roles.some((r) => roles.includes(r)),
      isApprover: roles.includes("approver"),
    }),
  ]);
  const params = reportParams(filters);
  const more = new URLSearchParams(params);
  more.set("limit", String(filters.limit + REPORT_PAGE_SIZE));
  const city = (timeZone.split("/").at(-1) ?? timeZone).replaceAll("_", " ");

  return (
    <div className="flex flex-col gap-3.5">
      <ReportHeader report={reportInfo("signature-log")} />
      <ReportFilterBar
        filters={filters}
        departments={options.departments}
        countries={options.countries}
        count={countSignatureLog}
      />
      <span role="status" className="text-xs text-graphite">
        {log.total} request{log.total === 1 ? "" : "s"} signed by IT ·{" "}
        {rangeLabel(reportDays(filters, timeZone))} ({city})
      </span>

      {log.rows.length > 0 ? (
        <>
          <div className="grid grid-cols-3 gap-2 md:max-w-2xl">
            <SummaryTile
              label="Approved"
              value={log.approved}
              note={`of ${log.total} signed by IT`}
            />
            <SummaryTile
              label="Typical time to approve"
              value={
                log.medianSeconds === null
                  ? "—"
                  : formatDuration(log.medianSeconds)
              }
              note="median"
            />
            <SummaryTile
              label="Returned at least once"
              value={log.returned}
              note={log.returned === 1 ? "request" : "requests"}
            />
          </div>
          <SignatureLogList rows={log.rows} />
          {log.total > log.rows.length && (
            <Link
              href={`/reports/signature-log?${more}`}
              scroll={false}
              className={`${buttonStyles("secondary", "md")} w-full md:w-auto md:self-start`}
            >
              Show {Math.min(REPORT_PAGE_SIZE, log.total - log.rows.length)}{" "}
              more
            </Link>
          )}
          <ExportBox
            href={`/reports/signature-log/export?${params}`}
            note="The export holds the signature fingerprints too. Each export is recorded in the audit log."
          />
        </>
      ) : (
        <div className="flex flex-col gap-1.5 rounded-card border border-line bg-paper p-5">
          <h2 className="font-serif text-xl">Nothing signed in this period</h2>
          <p className="text-sm text-graphite">
            Try a longer period, another search or fewer filters.
          </p>
        </div>
      )}
    </div>
  );
}

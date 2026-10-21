import Link from "next/link";
import { ExportBox } from "@/components/reports/ExportBox";
import { ReportFilterBar } from "@/components/reports/ReportFilterBar";
import { ReportHeader } from "@/components/reports/ReportHeader";
import {
  SlaReportList,
  SlaTimelineTable,
} from "@/components/reports/SlaReportList";
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
import { loadSlaReport } from "@/lib/reports/offboarding-sla";
import { companyTimezone } from "@/lib/time/display";
import { countOffboardingSla } from "../actions";

export const metadata = { title: "Offboarding SLA" };

/** Report: was every leaver's access removed in time? (board: Phone · Offboarding SLA). */
export default async function OffboardingSlaPage({
  searchParams,
}: PageProps<"/reports/offboarding-sla">) {
  const { roles } = await requireRole(...PAGES.reports.roles);
  // Offboardings only — a request type in the URL does not apply.
  const filters = { ...parseReportFilters(await searchParams), type: null };
  const timeZone = await companyTimezone();
  const [options, report] = await Promise.all([
    loadReportOptions(),
    loadSlaReport(filters, {
      timeZone,
      canOpenRequests: PAGES.requests.roles.some((r) => roles.includes(r)),
      isApprover: roles.includes("approver"),
    }),
  ]);
  const { summary } = report;
  const params = reportParams(filters);
  const more = new URLSearchParams(params);
  more.set("limit", String(filters.limit + REPORT_PAGE_SIZE));
  const city = (timeZone.split("/").at(-1) ?? timeZone).replaceAll("_", " ");

  return (
    <div className="flex flex-col gap-3.5">
      <ReportHeader report={reportInfo("offboarding-sla")} />
      <ReportFilterBar
        filters={filters}
        options={options}
        count={countOffboardingSla}
        noun="offboardings"
        types={false}
      />
      <span role="status" className="text-xs text-graphite">
        {report.total} offboarding{report.total === 1 ? "" : "s"} ·{" "}
        {rangeLabel(reportDays(filters, timeZone))} ({city})
        {filters.to ? "" : " · upcoming deadlines included"}
      </span>

      {report.rows.length > 0 ? (
        <>
          <div className="grid grid-cols-3 gap-2 md:max-w-2xl">
            <SummaryTile
              label="Met on time"
              value={
                summary.metPercent === null ? "—" : `${summary.metPercent}%`
              }
              note={
                summary.decided
                  ? `${summary.met} of ${summary.decided} decided`
                  : "none decided yet"
              }
            />
            <SummaryTile
              label="Missed"
              value={summary.missed}
              note="removed after the deadline"
            />
            <SummaryTile
              label="Still open"
              value={summary.open}
              note={
                summary.overdue ? `${summary.overdue} overdue` : "none overdue"
              }
            />
          </div>
          <SlaTimelineTable summary={summary} />
          <SlaReportList rows={report.rows} />
          {report.total > report.rows.length && (
            <Link
              href={`/reports/offboarding-sla?${more}`}
              scroll={false}
              className={`${buttonStyles("secondary", "md")} w-full md:w-auto md:self-start`}
            >
              Show{" "}
              {Math.min(REPORT_PAGE_SIZE, report.total - report.rows.length)}{" "}
              more
            </Link>
          )}
          <ExportBox
            href={`/reports/offboarding-sla/export?${params}`}
            note="One line per offboarding, with the missed reason. Each export is recorded in the audit log."
          />
        </>
      ) : (
        <div className="flex flex-col gap-1.5 rounded-card border border-line bg-paper p-5">
          <h2 className="font-serif text-xl">
            No offboarding deadlines in this period
          </h2>
          <p className="text-sm text-graphite">
            Offboardings appear here once execution has started. Try a longer
            period, another search or fewer filters.
          </p>
        </div>
      )}
    </div>
  );
}

import Link from "next/link";
import { AllUsersList } from "@/components/reports/AllUsersList";
import { ExportBox } from "@/components/reports/ExportBox";
import { ReportFilterBar } from "@/components/reports/ReportFilterBar";
import { ReportHeader } from "@/components/reports/ReportHeader";
import { buttonStyles } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { PAGES } from "@/lib/navigation";
import { loadAllUsers, loadReportOptions } from "@/lib/reports/all-users";
import { reportInfo } from "@/lib/reports/catalog";
import {
  REPORT_PAGE_SIZE,
  parseReportFilters,
  rangeLabel,
  reportDays,
  reportParams,
} from "@/lib/reports/filters";
import { companyTimezone } from "@/lib/time/display";
import { countAllUsers } from "../actions";

export const metadata = { title: "All users list" };

/** Report: everyone with a request in the period (board: Phone · All users list). */
export default async function AllUsersReportPage({
  searchParams,
}: PageProps<"/reports/all-users">) {
  const { roles } = await requireRole(...PAGES.reports.roles);
  const filters = parseReportFilters(await searchParams);
  const timeZone = await companyTimezone();
  const [options, report] = await Promise.all([
    loadReportOptions(),
    loadAllUsers(filters, {
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
      <ReportHeader report={reportInfo("all-users")} />
      <ReportFilterBar
        filters={filters}
        options={options}
        count={countAllUsers}
      />
      <span role="status" className="text-xs text-graphite">
        {report.total} request{report.total === 1 ? "" : "s"} · {report.people}{" "}
        {report.people === 1 ? "person" : "people"} ·{" "}
        {rangeLabel(reportDays(filters, timeZone))} ({city})
      </span>

      {report.rows.length > 0 ? (
        <>
          <AllUsersList rows={report.rows} />
          {report.total > report.rows.length && (
            <Link
              href={`/reports/all-users?${more}`}
              scroll={false}
              className={`${buttonStyles("secondary", "md")} w-full md:w-auto md:self-start`}
            >
              Show{" "}
              {Math.min(REPORT_PAGE_SIZE, report.total - report.rows.length)}{" "}
              more
            </Link>
          )}
          <ExportBox
            href={`/reports/all-users/export?${params}`}
            note={`Exports the ${report.total} request${report.total === 1 ? "" : "s"} above with these filters. Each export is recorded in the audit log.`}
          />
        </>
      ) : (
        <div className="flex flex-col gap-1.5 rounded-card border border-line bg-paper p-5">
          <h2 className="font-serif text-xl">No requests match</h2>
          <p className="text-sm text-graphite">
            Try a longer period, another search or fewer filters.
          </p>
        </div>
      )}
    </div>
  );
}

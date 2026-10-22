import Link from "next/link";
import { EmployeeList } from "@/components/reports/EmployeesReport";
import { ExportBox } from "@/components/reports/ExportBox";
import { ReportFilterBar } from "@/components/reports/ReportFilterBar";
import { ChevronLeftIcon, buttonStyles } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { PAGES } from "@/lib/navigation";
import { loadReportOptions } from "@/lib/reports/all-users";
import { peopleTitle } from "@/lib/reports/employees";
import { loadEmployees } from "@/lib/reports/employees-load";
import {
  REPORT_PAGE_SIZE,
  parseReportFilters,
  reportNames,
  reportParams,
} from "@/lib/reports/filters";
import { formatDayTime } from "@/lib/requests/format";
import { companyTimezone } from "@/lib/time/display";
import { countEmployees } from "../../actions";

export const metadata = { title: "Employees by office" };

/** The people employed today in one office (or state · city): a row of Employees by office. */
export default async function EmployeesPeoplePage({
  searchParams,
}: PageProps<"/reports/employees-by-office/people">) {
  const { roles } = await requireRole(...PAGES.reports.roles);
  const filters = { ...parseReportFilters(await searchParams), type: null };
  const timeZone = await companyTimezone();
  const [options, report] = await Promise.all([
    loadReportOptions(),
    loadEmployees(filters, {
      timeZone,
      canOpenRequests: PAGES.requests.roles.some((r) => roles.includes(r)),
      isApprover: roles.includes("approver"),
    }),
  ]);
  const params = reportParams({
    ...filters,
    period: "12m",
    from: null,
    to: null,
  });
  // Back to the overview with the same filters, minus the row's place.
  const back = new URLSearchParams(params);
  for (const key of ["q", "office", "state", "city"]) back.delete(key);
  const more = new URLSearchParams(params);
  more.set("limit", String(filters.limit + REPORT_PAGE_SIZE));
  const exportParams = new URLSearchParams(params);
  exportParams.delete("q");
  const city = (timeZone.split("/").at(-1) ?? timeZone).replaceAll("_", " ");
  const title = peopleTitle(filters, reportNames(options));

  return (
    <div className="flex flex-col gap-3.5">
      <Link
        href={`/reports/employees-by-office${back.size ? `?${back}` : ""}`}
        className="-ml-2 flex h-11 items-center gap-1 self-start px-2 text-sm font-semibold"
      >
        <ChevronLeftIcon size={18} />
        Employees by office
      </Link>
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-bold tracking-[0.12em] text-graphite uppercase">
          Employees today
        </span>
        <h1 className="font-serif text-[32px] leading-tight">{title}</h1>
        <span role="status" className="text-[13px] text-graphite">
          {report.total} {report.total === 1 ? "person" : "people"} ·{" "}
          {formatDayTime(new Date().toISOString(), timeZone)} ({city})
        </span>
      </div>

      <ReportFilterBar
        filters={filters}
        options={options}
        count={countEmployees}
        noun="people"
        nounOne="person"
        types={false}
        periods={false}
        search="Name or email"
      />

      {report.rows.length > 0 ? (
        <>
          <EmployeeList rows={report.rows} />
          {report.total > report.rows.length && (
            <Link
              href={`/reports/employees-by-office/people?${more}`}
              scroll={false}
              className={`${buttonStyles("secondary", "md")} w-full md:w-auto md:self-start`}
            >
              Show{" "}
              {Math.min(REPORT_PAGE_SIZE, report.total - report.rows.length)}{" "}
              more
            </Link>
          )}
          <ExportBox
            href={`/reports/employees-by-office/export?${exportParams}`}
            note={`Exports the people of ${title} with office, location, country and nationality. Each export is recorded in the audit log.`}
          />
        </>
      ) : (
        <div className="flex flex-col gap-1.5 rounded-card border border-line bg-paper p-5">
          <h2 className="font-serif text-xl">Nobody matches</h2>
          <p className="text-sm text-graphite">
            Try another search or fewer filters.
          </p>
        </div>
      )}
    </div>
  );
}

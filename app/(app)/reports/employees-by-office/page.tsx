import { ExportBox } from "@/components/reports/ExportBox";
import { OfficeBars, OfficeTable } from "@/components/reports/EmployeesReport";
import { ReportFilterBar } from "@/components/reports/ReportFilterBar";
import { ReportHeader } from "@/components/reports/ReportHeader";
import { SummaryTile } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { PAGES } from "@/lib/navigation";
import { loadReportOptions } from "@/lib/reports/all-users";
import { reportInfo } from "@/lib/reports/catalog";
import { peopleHref } from "@/lib/reports/employees";
import { loadEmployeesByOffice } from "@/lib/reports/employees-load";
import { parseReportFilters, reportParams } from "@/lib/reports/filters";
import { formatDayTime } from "@/lib/requests/format";
import { companyTimezone } from "@/lib/time/display";
import { countEmployees } from "../actions";

export const metadata = { title: "Employees by office" };

/** Report: the headcount today per office (board: Phone · Employees by office). */
export default async function EmployeesByOfficePage({
  searchParams,
}: PageProps<"/reports/employees-by-office">) {
  await requireRole(...PAGES.reports.roles);
  // Today only: no period, request type or search.
  const filters = {
    ...parseReportFilters(await searchParams),
    type: null,
    q: "",
  };
  const timeZone = await companyTimezone();
  const [options, report] = await Promise.all([
    loadReportOptions(),
    loadEmployeesByOffice(filters),
  ]);
  const { lines, totals } = report;
  const params = reportParams({
    ...filters,
    period: "12m",
    from: null,
    to: null,
  });
  const city = (timeZone.split("/").at(-1) ?? timeZone).replaceAll("_", " ");
  const now = formatDayTime(new Date().toISOString(), timeZone);

  return (
    <div className="flex flex-col gap-3.5">
      <ReportHeader report={reportInfo("employees-by-office")} />
      <ReportFilterBar
        filters={filters}
        options={options}
        count={countEmployees}
        noun="employees"
        counts
        periods={false}
        lead={
          <span className="inline-flex h-8 items-center rounded-pill bg-line-subtle px-3 text-xs font-semibold">
            As of today
          </span>
        }
      />
      <span role="status" className="text-xs text-graphite">
        {totals.employees} employee{totals.employees === 1 ? "" : "s"} ·{" "}
        {totals.offices} office{totals.offices === 1 ? "" : "s"} · {now} ({city}
        )
      </span>

      {lines.length === 0 ? (
        <div className="flex flex-col gap-1.5 rounded-card border border-line bg-paper p-5">
          <h2 className="font-serif text-xl">Nobody matches</h2>
          <p className="text-sm text-graphite">
            Nobody employed today matches these filters. Try fewer filters.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 md:max-w-2xl">
            <SummaryTile
              label="Employees"
              value={totals.employees}
              note="today"
            />
            <SummaryTile
              label="Biggest office"
              value={totals.biggest?.value ?? 0}
              note={totals.biggest?.note ?? "—"}
            />
            <SummaryTile
              label="Leaving"
              value={totals.leaving}
              note="offboarding open"
            />
          </div>

          <section className="flex flex-col gap-1 rounded-card border border-line bg-paper p-3.5 md:max-w-3xl">
            <h2 className="mb-1.5 text-sm font-bold">People per office</h2>
            <OfficeBars
              lines={lines}
              hrefFor={(line) => peopleHref(line.link, params)}
            />
            <p className="mt-1.5 text-xs text-graphite">
              The US is broken down by state and city. Tap a row for the list of
              people.
            </p>
          </section>

          <OfficeTable lines={lines} totals={totals} />

          <ExportBox
            href={`/reports/employees-by-office/export?${params}`}
            note="The CSV lists every employee with office, location, country and nationality. Each export is recorded in the audit log."
          />
        </>
      )}
    </div>
  );
}

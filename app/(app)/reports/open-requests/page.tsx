import { ExportBox } from "@/components/reports/ExportBox";
import {
  OpenRequestGroups,
  OpenStatusBars,
} from "@/components/reports/OpenRequests";
import { ReportFilterBar } from "@/components/reports/ReportFilterBar";
import { ReportHeader } from "@/components/reports/ReportHeader";
import { SummaryTile } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { PAGES } from "@/lib/navigation";
import { loadReportOptions } from "@/lib/reports/all-users";
import { reportInfo } from "@/lib/reports/catalog";
import { parseReportFilters, reportParams } from "@/lib/reports/filters";
import { loadOpenRequests } from "@/lib/reports/open-load";
import { formatDayTime } from "@/lib/requests/format";
import { companyTimezone } from "@/lib/time/display";
import { countOpenRequests } from "../actions";

export const metadata = { title: "Open requests by status" };

/** Report: where work is waiting right now (board: Phone · Open requests by status). */
export default async function OpenRequestsPage({
  searchParams,
}: PageProps<"/reports/open-requests">) {
  const { roles } = await requireRole(...PAGES.reports.roles);
  // Right now: no period, country or department.
  const filters = {
    ...parseReportFilters(await searchParams),
    period: "12m" as const,
    from: null,
    to: null,
    country: null,
    department: null,
  };
  const timeZone = await companyTimezone();
  const [options, report] = await Promise.all([
    loadReportOptions(),
    loadOpenRequests(filters, {
      timeZone,
      canOpenRequests: PAGES.requests.roles.some((r) => roles.includes(r)),
      isApprover: roles.includes("approver"),
    }),
  ]);
  const { summary } = report;
  const city = (timeZone.split("/").at(-1) ?? timeZone).replaceAll("_", " ");
  const params = reportParams(filters);

  return (
    <div className="flex flex-col gap-3.5">
      <ReportHeader report={reportInfo("open-requests")} />
      <ReportFilterBar
        filters={filters}
        departments={options.departments}
        countries={options.countries}
        count={countOpenRequests}
        periods={false}
        places={false}
        lead={
          <span className="inline-flex h-8 items-center rounded-pill bg-line-subtle px-3 text-xs font-semibold">
            Right now
          </span>
        }
      />
      <span role="status" className="text-xs text-graphite">
        {summary.total} open request{summary.total === 1 ? "" : "s"} ·{" "}
        {formatDayTime(new Date().toISOString(), timeZone)} ({city})
      </span>

      {summary.total > 0 ? (
        <>
          <div className="grid grid-cols-3 gap-2 md:max-w-2xl">
            <SummaryTile
              label="Open"
              value={summary.total}
              note={`${summary.withIt} with IT, ${summary.withApprover} with the approver`}
            />
            <SummaryTile
              label="Longest waiting"
              value={summary.longest?.waiting ?? "—"}
              note={summary.longest ? summary.longest.title.toLowerCase() : ""}
            />
            <SummaryTile
              label="Offboardings"
              value={summary.offboardings}
              note={
                summary.overdue ? `${summary.overdue} overdue` : "none overdue"
              }
            />
          </div>
          <section className="flex flex-col gap-2.5 rounded-card border border-line bg-paper p-3.5 md:max-w-2xl">
            <h2 className="text-sm font-bold">Requests per status</h2>
            <OpenStatusBars groups={summary.groups} />
          </section>
          <OpenRequestGroups groups={summary.groups} />
          <ExportBox
            href={`/reports/open-requests/export${params.size ? `?${params}` : ""}`}
            note="One line per open request, with how long it has waited. Each export is recorded in the audit log."
          />
        </>
      ) : (
        <div className="flex flex-col gap-1.5 rounded-card border border-line bg-paper p-5">
          <h2 className="font-serif text-xl">Nothing is waiting</h2>
          <p className="text-sm text-graphite">
            Every request is closed or cancelled — or try another search or
            type.
          </p>
        </div>
      )}
    </div>
  );
}

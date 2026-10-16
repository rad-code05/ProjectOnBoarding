import { ExportBox } from "@/components/reports/ExportBox";
import { MonthBarChart } from "@/components/reports/MonthBarChart";
import { ReportFilterBar } from "@/components/reports/ReportFilterBar";
import { ReportHeader } from "@/components/reports/ReportHeader";
import { SummaryTile } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { PAGES } from "@/lib/navigation";
import { loadReportOptions } from "@/lib/reports/all-users";
import { reportInfo } from "@/lib/reports/catalog";
import { parseReportFilters, reportParams } from "@/lib/reports/filters";
import { monthLabel, summarise } from "@/lib/reports/months";
import { loadOnboardedByMonth } from "@/lib/reports/onboarded";
import { companyTimezone } from "@/lib/time/display";
import { countOnboarded } from "../actions";

export const metadata = { title: "Onboarded by month" };

/**
 * Report: onboardings closed by the approver per month (D16; board: Phone ·
 * Onboarded by month) — three tiles, the bar chart and every month as a table.
 */
export default async function OnboardedByMonthPage({
  searchParams,
}: PageProps<"/reports/onboarded-by-month">) {
  await requireRole(...PAGES.reports.roles);
  // Onboardings only, and there is nothing to search in a count.
  const filters = {
    ...parseReportFilters(await searchParams),
    type: null,
    q: "",
  };
  const timeZone = await companyTimezone();
  const [options, report] = await Promise.all([
    loadReportOptions(),
    loadOnboardedByMonth(filters, timeZone),
  ]);
  const { total, busiest } = summarise(report.months);
  const span = `${monthLabel(report.span.first)} – ${monthLabel(report.span.last)}`;
  const city = (timeZone.split("/").at(-1) ?? timeZone).replaceAll("_", " ");

  return (
    <div className="flex flex-col gap-3.5">
      <ReportHeader report={reportInfo("onboarded-by-month")} />
      <ReportFilterBar
        filters={filters}
        departments={options.departments}
        countries={options.countries}
        count={countOnboarded}
        noun="onboardings"
        counts
      />
      <span role="status" className="text-xs text-graphite">
        {span} · months in company time ({city})
      </span>

      <div className="grid grid-cols-3 gap-2 md:max-w-2xl">
        <SummaryTile
          label="This month"
          value={report.thisMonth.onboarded}
          note={`${monthLabel(report.thisMonth.month)}, so far`}
        />
        <SummaryTile label="In this period" value={total} note={span} />
        <SummaryTile
          label="Busiest month"
          value={busiest?.onboarded ?? 0}
          note={busiest ? monthLabel(busiest.month) : "—"}
        />
      </div>

      <section
        aria-labelledby="chart-heading"
        className="flex flex-col gap-2 rounded-card border border-line bg-paper p-3.5"
      >
        <div className="flex items-baseline justify-between gap-2">
          <h2 id="chart-heading" className="text-sm font-bold">
            Onboarded per month
          </h2>
          <span className="text-xs text-graphite">{span}</span>
        </div>
        <MonthBarChart months={report.months} />
        <p className="text-xs text-graphite">
          Touch a bar for its exact number. The table has every month.
        </p>
      </section>

      <section className="overflow-hidden rounded-card border border-line bg-paper md:max-w-md">
        <table className="w-full border-collapse text-sm tabular-nums">
          <caption className="px-3.5 pt-3 pb-1.5 text-left text-sm font-bold">
            Every month
          </caption>
          <thead>
            <tr className="border-b border-line text-xs text-graphite">
              <th scope="col" className="px-3.5 py-2 text-left font-semibold">
                Month
              </th>
              <th scope="col" className="px-3.5 py-2 text-right font-semibold">
                Onboarded
              </th>
            </tr>
          </thead>
          <tbody>
            {report.months
              .slice()
              .reverse()
              .map((m) => (
                <tr key={m.month} className="border-b border-line-subtle">
                  <th scope="row" className="px-3.5 py-2 text-left font-medium">
                    {monthLabel(m.month)}
                  </th>
                  <td className="px-3.5 py-2 text-right">{m.onboarded}</td>
                </tr>
              ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" className="px-3.5 py-2.5 text-left">
                Total
              </th>
              <td className="px-3.5 py-2.5 text-right font-bold">{total}</td>
            </tr>
          </tfoot>
        </table>
      </section>

      <ExportBox
        href={`/reports/onboarded-by-month/export?${reportParams(filters)}`}
        note="Exports every month above with these filters. Each export is recorded in the audit log."
      />
    </div>
  );
}

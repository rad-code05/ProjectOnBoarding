import { ExportBox } from "@/components/reports/ExportBox";
import { HBarChart } from "@/components/reports/HBarChart";
import { ReportFilterBar } from "@/components/reports/ReportFilterBar";
import { ReportHeader } from "@/components/reports/ReportHeader";
import { SummaryTile } from "@/components/ui";
import { loadReportOptions } from "@/lib/reports/all-users";
import { reportInfo } from "@/lib/reports/catalog";
import {
  rangeLabel,
  reportDays,
  reportParams,
  type ReportFilters,
} from "@/lib/reports/filters";
import { groupTiles, type ReportGroup } from "@/lib/reports/groups";
import { loadOnboardedBy } from "@/lib/reports/onboarded-by";

/**
 * "Onboarded by country / department" (F13b; board: Phone · Onboarded by
 * country): definition, filters, two tiles, horizontal bars, every group
 * with its share, audited CSV / PDF. One page, two groupings.
 */
export async function GroupReport({
  group,
  filters,
  timeZone,
  count,
}: {
  group: ReportGroup;
  filters: ReportFilters;
  timeZone: string;
  count: (search: string) => Promise<number | null>;
}) {
  const slug =
    group === "country" ? "onboarded-by-country" : "onboarded-by-department";
  const [options, report] = await Promise.all([
    loadReportOptions(),
    loadOnboardedBy(group, filters, timeZone),
  ]);
  const tiles = groupTiles(report.rows, group);
  const city = (timeZone.split("/").at(-1) ?? timeZone).replaceAll("_", " ");
  const span = `${rangeLabel(reportDays(filters, timeZone))} (${city})`;

  return (
    <div className="flex flex-col gap-3.5">
      <ReportHeader report={reportInfo(slug)} />
      <ReportFilterBar
        filters={filters}
        options={options}
        count={count}
        noun="onboardings"
        counts
      />
      <span role="status" className="text-xs text-graphite">
        {report.total} onboarding{report.total === 1 ? "" : "s"} ·{" "}
        {tiles.groups} {tiles.groups === 1 ? tiles.words.one : tiles.words.many}{" "}
        · {span}
      </span>

      {report.rows.length === 0 ? (
        <div className="flex flex-col gap-1.5 rounded-card border border-line bg-paper p-5">
          <h2 className="font-serif text-xl">No onboardings in this period</h2>
          <p className="text-sm text-graphite">
            Try a longer period or fewer filters.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 md:max-w-md">
            <SummaryTile
              label={tiles.words.label}
              value={tiles.groups}
              note="with at least one onboarding"
            />
            <SummaryTile
              label="Most onboardings"
              value={tiles.top?.value ?? 0}
              note={tiles.top?.note ?? "—"}
            />
          </div>

          <section
            aria-labelledby="bars-heading"
            className="flex flex-col gap-2.5 rounded-card border border-line bg-paper p-3.5 md:max-w-2xl"
          >
            <h2 id="bars-heading" className="text-sm font-bold">
              Onboarded per {tiles.words.one}
            </h2>
            <HBarChart rows={report.rows} />
            <p className="text-xs text-graphite">
              Longest bar first. The table has the share of each{" "}
              {tiles.words.one}.
            </p>
          </section>

          <section className="overflow-hidden rounded-card border border-line bg-paper md:max-w-md">
            <table className="w-full border-collapse text-sm tabular-nums">
              <caption className="px-3.5 pt-3 pb-1.5 text-left text-sm font-bold">
                Every {tiles.words.one}
              </caption>
              <thead>
                <tr className="border-b border-line text-xs text-graphite">
                  <th
                    scope="col"
                    className="px-3.5 py-2 text-left font-semibold"
                  >
                    {tiles.words.column}
                  </th>
                  <th
                    scope="col"
                    className="px-3.5 py-2 text-right font-semibold"
                  >
                    Onboarded
                  </th>
                  <th
                    scope="col"
                    className="px-3.5 py-2 text-right font-semibold"
                  >
                    Share
                  </th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((r) => (
                  <tr
                    key={r.key ?? "none"}
                    className="border-b border-line-subtle"
                  >
                    <th
                      scope="row"
                      className="px-3.5 py-2 text-left font-medium"
                    >
                      {r.label}
                    </th>
                    <td className="px-3.5 py-2 text-right">{r.onboarded}</td>
                    <td className="px-3.5 py-2 text-right text-graphite">
                      {r.share}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row" className="px-3.5 py-2.5 text-left">
                    Total
                  </th>
                  <td className="px-3.5 py-2.5 text-right font-bold">
                    {report.total}
                  </td>
                  <td className="px-3.5 py-2.5 text-right text-graphite">
                    100%
                  </td>
                </tr>
              </tfoot>
            </table>
          </section>

          <ExportBox
            href={`/reports/${slug}/export?${reportParams(filters)}`}
            note="Exports every group above with these filters. Each export is recorded in the audit log."
          />
        </>
      )}
    </div>
  );
}

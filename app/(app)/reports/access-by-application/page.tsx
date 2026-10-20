import Link from "next/link";
import {
  AccessItemBars,
  AccessKindTabs,
} from "@/components/reports/AccessReport";
import { ExportBox } from "@/components/reports/ExportBox";
import { ReportFilterBar } from "@/components/reports/ReportFilterBar";
import { ReportHeader } from "@/components/reports/ReportHeader";
import { SummaryTile, buttonStyles } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { PAGES } from "@/lib/navigation";
import {
  ACCESS_KIND_INFO,
  holdersHref,
  parseAccessKind,
  type AccessKind,
} from "@/lib/reports/access";
import { loadAccessByItem } from "@/lib/reports/access-load";
import { loadReportOptions } from "@/lib/reports/all-users";
import { reportInfo } from "@/lib/reports/catalog";
import { parseReportFilters, reportParams } from "@/lib/reports/filters";
import { formatDayTime } from "@/lib/requests/format";
import { companyTimezone } from "@/lib/time/display";
import { countAccess } from "../actions";

export const metadata = { title: "Access by application" };

/** Rows shown before "Show all …". */
const TOP = 10;

/** Report: who holds what today (board: Phone · Access by application). */
export default async function AccessByApplicationPage({
  searchParams,
}: PageProps<"/reports/access-by-application">) {
  await requireRole(...PAGES.reports.roles);
  const query = await searchParams;
  const kind = parseAccessKind(query.kind);
  // Today only: no period or request type.
  const filters = { ...parseReportFilters(query), type: null };
  const showAll = query.all === "1";
  const timeZone = await companyTimezone();
  const [options, report] = await Promise.all([
    loadReportOptions(),
    loadAccessByItem(kind, filters),
  ]);
  const { items, totals } = report;
  const info = ACCESS_KIND_INFO[kind];
  const params = reportParams({
    ...filters,
    period: "12m",
    from: null,
    to: null,
  });
  const withKind = (k: AccessKind, extra?: Record<string, string>) => {
    const p = new URLSearchParams(params);
    if (k !== "application") p.set("kind", k);
    for (const [key, value] of Object.entries(extra ?? {})) p.set(key, value);
    const s = p.toString();
    return `/reports/access-by-application${s ? `?${s}` : ""}`;
  };
  const city = (timeZone.split("/").at(-1) ?? timeZone).replaceAll("_", " ");
  const now = formatDayTime(new Date().toISOString(), timeZone);
  const shown = showAll ? items : items.slice(0, TOP);
  const exportParams = new URLSearchParams(params);
  exportParams.set("kind", kind);

  return (
    <div className="flex flex-col gap-3.5">
      <ReportHeader report={reportInfo("access-by-application")} />
      <AccessKindTabs kind={kind} hrefFor={(k) => withKind(k)} />
      <ReportFilterBar
        filters={filters}
        departments={options.departments}
        countries={options.countries}
        count={countAccess.bind(null, kind, null)}
        noun="people"
        nounOne="person"
        types={false}
        periods={false}
        search="Name, email or item"
        keep={kind === "application" ? undefined : { kind }}
        lead={
          <span className="inline-flex h-8 items-center rounded-pill bg-line-subtle px-3 text-xs font-semibold">
            As of today
          </span>
        }
      />
      <span role="status" className="text-xs text-graphite">
        {totals.people} {totals.people === 1 ? "person" : "people"} ·{" "}
        {totals.inUse} of {totals.catalog} {info.plural} in use · {now} ({city})
      </span>

      {items.length > 0 ? (
        <>
          <div className="grid grid-cols-3 gap-2 md:max-w-2xl">
            <SummaryTile
              label="People with access"
              value={totals.people}
              note={`${totals.rights} held in all`}
            />
            <SummaryTile
              label={`${info.tab} in use`}
              value={totals.inUse}
              note={`of ${totals.catalog} in the catalog`}
            />
            <SummaryTile
              label="Leaving"
              value={totals.leaving}
              note="offboarding open, still hold access"
            />
          </div>
          <section className="flex flex-col gap-1 rounded-card border border-line bg-paper p-3.5 md:max-w-3xl">
            <h2 className="mb-1.5 text-sm font-bold">{info.bars}</h2>
            <AccessItemBars
              items={shown}
              hrefFor={(key) => holdersHref(kind, key, params)}
            />
            {items.length > shown.length && (
              <Link
                href={withKind(kind, { all: "1" })}
                scroll={false}
                className={`${buttonStyles("secondary", "md")} mt-2 w-full md:w-auto md:self-start`}
              >
                Show all {items.length} {info.all}
              </Link>
            )}
            <p className="mt-1 text-xs text-graphite">
              Tap a row to see who holds it and since when.
            </p>
          </section>
          <ExportBox
            href={`/reports/access-by-application/export?${exportParams}`}
            note="One line per person and item, with permission, since when and the request that granted it — audit evidence. Each export is recorded in the audit log."
          />
        </>
      ) : (
        <div className="flex flex-col gap-1.5 rounded-card border border-line bg-paper p-5">
          <h2 className="font-serif text-xl">Nobody holds anything here yet</h2>
          <p className="text-sm text-graphite">
            Access appears once a request is closed by the approver. Try another
            tab, another search or fewer filters.
          </p>
        </div>
      )}
    </div>
  );
}

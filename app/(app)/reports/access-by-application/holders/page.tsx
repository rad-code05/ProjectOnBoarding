import Link from "next/link";
import { notFound } from "next/navigation";
import { AccessHolderList } from "@/components/reports/AccessReport";
import { ExportBox } from "@/components/reports/ExportBox";
import { HBarChart } from "@/components/reports/HBarChart";
import { ReportFilterBar } from "@/components/reports/ReportFilterBar";
import { ChevronLeftIcon, buttonStyles } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { PAGES } from "@/lib/navigation";
import {
  ACCESS_KIND_INFO,
  parseAccessKind,
  parseItemKey,
} from "@/lib/reports/access";
import { loadAccessHolders } from "@/lib/reports/access-load";
import { loadReportOptions } from "@/lib/reports/all-users";
import {
  REPORT_PAGE_SIZE,
  parseReportFilters,
  reportParams,
} from "@/lib/reports/filters";
import { formatDayTime } from "@/lib/requests/format";
import { companyTimezone } from "@/lib/time/display";
import { countAccess } from "../../actions";

export const metadata = { title: "Access by application" };

/**
 * Who holds one application / device / access type today (board: Phone ·
 * Access by application · one app (who holds it)).
 */
export default async function AccessHoldersPage({
  searchParams,
}: PageProps<"/reports/access-by-application/holders">) {
  const { roles } = await requireRole(...PAGES.reports.roles);
  const query = await searchParams;
  const kind = parseAccessKind(query.kind);
  const item = parseItemKey(query.item);
  if (!item) notFound();
  const filters = { ...parseReportFilters(query), type: null };
  const timeZone = await companyTimezone();
  const [options, report] = await Promise.all([
    loadReportOptions(),
    loadAccessHolders(kind, item, filters, {
      timeZone,
      canOpenRequests: PAGES.requests.roles.some((r) => roles.includes(r)),
      isApprover: roles.includes("approver"),
    }),
  ]);
  const info = ACCESS_KIND_INFO[kind];
  const keep = { kind, item };
  const params = new URLSearchParams(keep);
  for (const [key, value] of reportParams({
    ...filters,
    period: "12m",
    from: null,
    to: null,
  })) {
    params.set(key, value);
  }
  const back = new URLSearchParams(params);
  back.delete("item");
  if (kind === "application") back.delete("kind");
  const more = new URLSearchParams(params);
  more.set("limit", String(filters.limit + REPORT_PAGE_SIZE));
  const city = (timeZone.split("/").at(-1) ?? timeZone).replaceAll("_", " ");
  const name = report.name ?? "Nobody holds this";

  return (
    <div className="flex flex-col gap-3.5">
      <Link
        href={`/reports/access-by-application${back.size ? `?${back}` : ""}`}
        className="-ml-2 flex h-11 items-center gap-1 self-start px-2 text-sm font-semibold"
      >
        <ChevronLeftIcon size={18} />
        Access by application
      </Link>
      <div className="flex flex-col gap-1.5">
        {report.category && (
          <span className="text-[11px] font-bold tracking-[0.12em] text-graphite uppercase">
            {report.category}
          </span>
        )}
        <h1 className="font-serif text-[32px] leading-tight">{name}</h1>
        <span role="status" className="text-[13px] text-graphite">
          {report.total} {report.total === 1 ? "person holds" : "people hold"}{" "}
          it today · {formatDayTime(new Date().toISOString(), timeZone)} ({city}
          )
        </span>
      </div>

      {kind !== "equipment" && report.permissions.length > 0 && (
        <section className="flex flex-col gap-2.5 rounded-card border border-line bg-paper p-3.5 md:max-w-2xl">
          <h2 className="text-sm font-bold">By {info.detail.toLowerCase()}</h2>
          <HBarChart rows={report.permissions} />
        </section>
      )}

      <ReportFilterBar
        filters={filters}
        options={options}
        count={countAccess.bind(null, kind, item)}
        noun="people"
        nounOne="person"
        types={false}
        periods={false}
        search="Name or email"
        keep={keep}
      />

      {report.rows.length > 0 ? (
        <>
          <AccessHolderList rows={report.rows} />
          {report.total > report.rows.length && (
            <Link
              href={`/reports/access-by-application/holders?${more}`}
              scroll={false}
              className={`${buttonStyles("secondary", "md")} w-full md:w-auto md:self-start`}
            >
              Show{" "}
              {Math.min(REPORT_PAGE_SIZE, report.total - report.rows.length)}{" "}
              more
            </Link>
          )}
          <ExportBox
            href={`/reports/access-by-application/export?${params}`}
            note={`Exports only ${name}. Each export is recorded in the audit log.`}
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

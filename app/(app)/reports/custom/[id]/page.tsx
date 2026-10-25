import Link from "next/link";
import { notFound } from "next/navigation";
import { CustomReportParts } from "@/components/reports/CustomReport";
import { DeleteCustomReport } from "@/components/reports/DeleteCustomReport";
import { ExportBox } from "@/components/reports/ExportBox";
import { ChevronLeftIcon } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { PAGES } from "@/lib/navigation";
import { loadCustomReport, runCustomReport } from "@/lib/reports/custom/store";
import { formatDayTime } from "@/lib/requests/format";
import { companyTimezone, displayTimezone } from "@/lib/time/display";

export const metadata = { title: "Custom report" };

/**
 * A custom report made with the assistant (board: Custom report page):
 * who made it and when, how it is built, each part read again now with the
 * reader's own access. Only the maker sees it (RLS).
 */
export default async function CustomReportPage({
  params,
}: PageProps<"/reports/custom/[id]">) {
  await requireRole(...PAGES.reports.roles);
  const { id } = await params;
  const report = await loadCustomReport(id);
  if (!report) notFound();
  const [timeZone, myZone] = await Promise.all([
    companyTimezone(),
    displayTimezone(),
  ]);
  const outcomes = report.definition
    ? await runCustomReport(report.definition, timeZone)
    : [];
  const city = (myZone.split("/").at(-1) ?? myZone).replaceAll("_", " ");

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-col gap-2">
        <Link
          href="/reports"
          className="-ml-2 flex h-11 items-center gap-1 self-start px-2 text-sm font-semibold md:hidden"
        >
          <ChevronLeftIcon size={18} />
          Reports
        </Link>
        <span className="text-[11px] font-bold tracking-[0.12em] text-graphite uppercase">
          Custom report · made with the assistant
        </span>
        <h1 className="font-serif text-[28px] leading-tight md:text-[32px]">
          {report.title}
        </h1>
        <span className="text-xs leading-normal text-graphite">
          Made {formatDayTime(report.createdAt, myZone)} ({city})
          {report.updatedAt !== report.createdAt &&
            ` · changed ${formatDayTime(report.updatedAt, myZone)}`}{" "}
          · data as of now · kept 60 days after the last change
        </span>
      </div>

      {report.definition ? (
        <>
          <CustomReportParts outcomes={outcomes} timeZone={timeZone} />
          <ExportBox
            href={`/reports/custom/${report.id}/export`}
            note="Exports every part as it is now. CSV: one file with a Part column; PDF: a section per part. Each export is recorded in the audit log."
          />
        </>
      ) : (
        <div className="flex flex-col gap-1.5 rounded-card border border-line bg-paper p-5">
          <h2 className="font-serif text-xl">This report can&apos;t be run</h2>
          <ul className="list-disc pl-4.5 text-sm text-graphite">
            {report.problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <p className="text-sm text-graphite">
            Ask the assistant to build it again.
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <DeleteCustomReport id={report.id} />
      </div>
    </div>
  );
}

import { MyCustomReports } from "@/components/reports/MyCustomReports";
import { ReportNav } from "@/components/reports/ReportNav";
import { requireRole } from "@/lib/auth";
import { PAGES } from "@/lib/navigation";
import { listMyCustomReports } from "@/lib/reports/custom/store";
import { displayTimezone } from "@/lib/time/display";

export const metadata = { title: "Reports" };

/** Choose a report (board: Phone · Reports); on desktop the list is on the left. */
export default async function ReportsPage() {
  await requireRole(...PAGES.reports.roles);
  const [mine, timeZone] = await Promise.all([
    listMyCustomReports(),
    displayTimezone(),
  ]);
  return (
    <div className="flex flex-col gap-4.5">
      <div className="flex flex-col gap-1.5">
        <h1 className="font-serif text-[34px] leading-tight md:text-[32px]">
          Reports
        </h1>
        <p className="text-sm leading-normal text-graphite">
          Choose a report. Each one says exactly how it counts, and every export
          is recorded in the audit log.
        </p>
      </div>
      <div className="flex flex-col gap-4.5 md:hidden">
        <MyCustomReports reports={mine} timeZone={timeZone} variant="page" />
        <ReportNav variant="page" />
      </div>
      <p className="hidden rounded-card border border-line bg-paper p-5 text-sm text-graphite md:block">
        Choose a report on the left.
      </p>
      <p className="text-xs leading-normal text-graphite">
        Approvers see the requests they may see everywhere else: awaiting
        confirmation, returned and closed.
      </p>
    </div>
  );
}

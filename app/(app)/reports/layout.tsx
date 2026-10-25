import type { ReactNode } from "react";
import { MyCustomReports } from "@/components/reports/MyCustomReports";
import { ReportNav } from "@/components/reports/ReportNav";
import { requireRole } from "@/lib/auth";
import { PAGES } from "@/lib/navigation";
import { listMyCustomReports } from "@/lib/reports/custom/store";
import { displayTimezone } from "@/lib/time/display";

/**
 * Reports: on desktop, your custom reports and the report types on the left
 * (design/reports.md, design/custom-reports.md).
 */
export default async function ReportsLayout({
  children,
}: {
  children: ReactNode;
}) {
  // The same check as every report page — and it reads the session first,
  // so Next renders these pages per request (never at build time).
  await requireRole(...PAGES.reports.roles);
  const [mine, timeZone] = await Promise.all([
    listMyCustomReports(),
    displayTimezone(),
  ]);
  return (
    <div className="md:grid md:grid-cols-[17.5rem_minmax(0,1fr)] md:items-start md:gap-8">
      <aside className="hidden md:sticky md:top-6 md:flex md:flex-col md:gap-4.5">
        <MyCustomReports reports={mine} timeZone={timeZone} variant="side" />
        <ReportNav variant="side" />
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

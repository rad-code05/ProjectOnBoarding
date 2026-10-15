import type { ReactNode } from "react";
import { ReportNav } from "@/components/reports/ReportNav";

/** Reports: the report types on the left on desktop (design/reports.md). */
export default function ReportsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="md:grid md:grid-cols-[17.5rem_minmax(0,1fr)] md:items-start md:gap-8">
      <aside className="hidden md:sticky md:top-6 md:block">
        <ReportNav variant="side" />
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

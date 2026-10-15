import Link from "next/link";
import { ChevronLeftIcon } from "@/components/ui";
import type { ReportInfo } from "@/lib/reports/catalog";

/** Back to the list (phone), group, name and the report's definition. */
export function ReportHeader({ report }: { report: ReportInfo }) {
  return (
    <div className="flex flex-col gap-2">
      <Link
        href="/reports"
        className="-ml-2 flex h-11 items-center gap-1 self-start px-2 text-sm font-semibold md:hidden"
      >
        <ChevronLeftIcon size={18} />
        Reports
      </Link>
      <span className="text-[11px] font-bold tracking-[0.12em] text-graphite uppercase">
        {report.group}
      </span>
      <h1 className="font-serif text-[32px] leading-tight">{report.name}</h1>
      <p className="rounded-[12px] border border-line bg-paper px-3 py-2.5 text-[13px] leading-normal">
        <strong>Definition:</strong> {report.definition}
      </p>
    </div>
  );
}

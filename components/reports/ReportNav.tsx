"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRightIcon } from "@/components/ui";
import { cn } from "@/lib/cn";
import { REPORTS, REPORT_GROUPS } from "@/lib/reports/catalog";

/**
 * The report types, grouped (board: Phone · Reports): the whole page on a
 * phone, the left side panel on desktop. Reports of later features are
 * listed but not linked yet.
 */
export function ReportNav({ variant }: { variant: "page" | "side" }) {
  const pathname = usePathname();
  const side = variant === "side";
  return (
    <nav aria-label="Reports" className="flex flex-col gap-4.5">
      {REPORT_GROUPS.map((group) => (
        <section key={group} className="flex flex-col gap-1.5">
          <h2 className="text-[11px] font-bold tracking-[0.12em] text-graphite uppercase">
            {group}
          </h2>
          <ul className="flex flex-col overflow-hidden rounded-card border border-line bg-paper">
            {REPORTS.filter((r) => r.group === group).map((report) => {
              const href = `/reports/${report.slug}`;
              const current = pathname === href;
              const body = (
                <>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span
                      className={cn(
                        "font-bold",
                        side ? "text-sm" : "text-[15px]",
                      )}
                    >
                      {report.name}
                    </span>
                    <span className="text-xs leading-snug text-graphite">
                      {report.ready ? report.desc : "Coming soon"}
                    </span>
                  </span>
                  {report.ready && !side && <ChevronRightIcon size={18} />}
                </>
              );
              return (
                <li
                  key={report.slug}
                  className="border-b border-line-subtle last:border-b-0"
                >
                  {report.ready ? (
                    <Link
                      href={href}
                      aria-current={current ? "page" : undefined}
                      className={cn(
                        "flex min-h-16 items-center gap-2.5 py-2.5 pr-2.5 pl-3.5 hover:bg-sand",
                        current && "outline-2 -outline-offset-2 outline-ink",
                      )}
                    >
                      {body}
                    </Link>
                  ) : (
                    <div className="flex min-h-16 items-center gap-2.5 py-2.5 pr-2.5 pl-3.5 opacity-60">
                      {body}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </nav>
  );
}

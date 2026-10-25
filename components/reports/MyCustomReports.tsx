import Link from "next/link";
import { ChevronRightIcon } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { CustomReportSummary } from "@/lib/reports/custom/store";
import { formatDayTime } from "@/lib/requests/format";

/**
 * "Your custom reports" (board: Reports with Your custom reports): the
 * reader's own reports made with the assistant, newest first — above the
 * standard reports. Nothing is shown until the first one exists.
 */
export function MyCustomReports({
  reports,
  timeZone,
  variant,
}: {
  reports: CustomReportSummary[];
  timeZone: string;
  variant: "page" | "side";
}) {
  if (reports.length === 0) return null;
  const side = variant === "side";
  return (
    <section
      aria-labelledby={`custom-${variant}`}
      className="flex flex-col gap-1.5"
    >
      <div className="flex items-baseline gap-2">
        <h2
          id={`custom-${variant}`}
          className="flex-1 text-[11px] font-bold tracking-[0.12em] text-graphite uppercase"
        >
          Your custom reports
        </h2>
        <span className="text-[11px] text-graphite">kept 60 days</span>
      </div>
      <ul className="flex flex-col overflow-hidden rounded-card border border-line bg-paper">
        {reports.map((r) => (
          <li
            key={r.id}
            className="border-b border-line-subtle last:border-b-0"
          >
            <Link
              href={`/reports/custom/${r.id}`}
              className="flex min-h-16 items-center gap-2.5 py-2.5 pr-2.5 pl-3.5 hover:bg-sand"
            >
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span
                  className={cn(
                    "font-bold wrap-anywhere",
                    side ? "text-sm" : "text-[15px]",
                  )}
                >
                  {r.title}
                </span>
                <span className="text-xs leading-snug text-graphite">
                  {r.parts} part{r.parts === 1 ? "" : "s"} · made{" "}
                  {formatDayTime(r.updatedAt, timeZone)}
                </span>
              </span>
              {!side && <ChevronRightIcon size={18} />}
            </Link>
          </li>
        ))}
      </ul>
      {!side && (
        <p className="text-xs leading-normal text-graphite">
          Only you see your custom reports. Ask the robot for any combination,
          for example &quot;people in Geneva who hold Figma and GitHub&quot;.
        </p>
      )}
    </section>
  );
}

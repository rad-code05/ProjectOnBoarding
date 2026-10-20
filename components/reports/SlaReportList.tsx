import Link from "next/link";
import { cn } from "@/lib/cn";
import type { SlaReportRow, SlaSummary } from "@/lib/reports/sla";

const toneStyles: Record<SlaReportRow["tone"], string> = {
  met: "bg-line-subtle text-ink",
  missed: "bg-signal text-white",
  open: "border border-signal text-signal",
};

/**
 * The Offboarding SLA cards (board: Phone · Offboarding SLA): name, ticket ·
 * timeline · status, the result in words (never colour alone), then Access
 * cut-off / Deadline / Removals / reason or margin. Two columns on desktop.
 */
export function SlaReportList({ rows }: { rows: SlaReportRow[] }) {
  return (
    <ul className="flex flex-col gap-2.5 md:grid md:grid-cols-2">
      {rows.map((row) => {
        const who = (
          <>
            <span className="truncate text-[15px] font-bold">{row.name}</span>
            <span className="truncate text-xs text-graphite">
              {row.subtitle}
            </span>
          </>
        );
        return (
          <li
            key={row.id}
            className="flex flex-col gap-2 rounded-card border border-line bg-paper px-3.5 py-3"
          >
            <div className="flex items-start gap-2">
              {row.href ? (
                <Link
                  href={row.href}
                  className="flex min-w-0 flex-1 flex-col gap-0.5"
                >
                  {who}
                </Link>
              ) : (
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  {who}
                </div>
              )}
              <span
                className={cn(
                  "inline-flex shrink-0 items-center rounded-pill px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap",
                  toneStyles[row.tone],
                )}
              >
                {row.result}
              </span>
            </div>
            <dl className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-2.5 gap-y-1 text-xs leading-snug">
              <dt className="text-graphite">Access cut-off</dt>
              <dd>{row.cutoff}</dd>
              <dt className="text-graphite">Deadline</dt>
              <dd>{row.deadline}</dd>
              <dt className="text-graphite">Removals</dt>
              <dd className="font-semibold">{row.removals}</dd>
              <dt className="text-graphite">{row.noteLabel}</dt>
              <dd>{row.note}</dd>
            </dl>
          </li>
        );
      })}
    </ul>
  );
}

/** "By timeline": met / missed / open per timeline, with a total row. */
export function SlaTimelineTable({ summary }: { summary: SlaSummary }) {
  const th =
    "px-2.5 py-2 text-right text-xs font-semibold text-graphite first:pl-3.5 first:text-left last:pr-3.5";
  const td = "px-2.5 py-2 text-right last:pr-3.5";
  return (
    <section className="overflow-hidden rounded-card border border-line bg-paper md:max-w-2xl">
      <table className="w-full border-collapse text-sm tabular-nums">
        <caption className="px-3.5 pt-3 pb-1.5 text-left text-sm font-bold">
          By timeline
        </caption>
        <thead>
          <tr className="border-b border-line">
            <th scope="col" className={th}>
              Timeline
            </th>
            <th scope="col" className={th}>
              Met
            </th>
            <th scope="col" className={th}>
              Missed
            </th>
            <th scope="col" className={th}>
              Open
            </th>
          </tr>
        </thead>
        <tbody>
          {summary.timelines.map((t) => (
            <tr key={t.timeline} className="border-b border-line-subtle">
              <th scope="row" className="px-3.5 py-2 text-left font-medium">
                {t.label}
              </th>
              <td className={td}>{t.met}</td>
              <td className={td}>{t.missed}</td>
              <td className={td}>{t.open}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" className="px-3.5 py-2.5 text-left">
              Total
            </th>
            <td className={`${td} font-bold`}>{summary.met}</td>
            <td className={`${td} font-bold`}>{summary.missed}</td>
            <td className={`${td} font-bold`}>{summary.open}</td>
          </tr>
        </tfoot>
      </table>
    </section>
  );
}

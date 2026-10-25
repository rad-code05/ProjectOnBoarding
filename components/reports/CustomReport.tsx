import type { Row } from "@/lib/reports/custom/datasets";
import type { Column, PartResult } from "@/lib/reports/custom/engine";
import type { PartOutcome } from "@/lib/reports/custom/store";
import { formatCell, partWords } from "@/lib/reports/custom/words";

/**
 * A custom report's parts (boards: Custom report page, … grouped with a
 * chart): "How this report is built" in plain words, then each part — cards
 * on a phone, a table on a wide screen, and for a grouped part with a
 * chart, one ink bar per group (the value always written beside it).
 */
export function CustomReportParts({
  outcomes,
  timeZone,
}: {
  outcomes: PartOutcome[];
  timeZone: string;
}) {
  return (
    <>
      <details
        open
        className="rounded-[12px] border border-line bg-paper px-3.5 py-3"
      >
        <summary className="min-h-7 cursor-pointer text-[13px] font-bold">
          How this report is built
        </summary>
        <ol className="mt-2 flex list-decimal flex-col gap-1.5 pl-4.5 text-[13px] leading-normal">
          {outcomes.map(({ part }, i) => (
            <li key={i}>
              <strong>{part.title}:</strong> {partWords(part)}
            </li>
          ))}
        </ol>
        <p className="mt-2 text-xs leading-normal text-graphite">
          Built with what you&apos;re allowed to see. Dates are company-time
          days; &quot;Onboarded&quot; = closed by the approver.
        </p>
      </details>
      {outcomes.map(({ part, result }, i) => (
        <section
          key={i}
          aria-labelledby={`part-${i}`}
          className="flex flex-col gap-2"
        >
          <div className="flex items-baseline gap-2">
            <h2
              id={`part-${i}`}
              className="flex-1 font-serif text-[21px] leading-tight"
            >
              {outcomes.length > 1 ? `${i + 1} · ` : ""}
              {part.title}
            </h2>
            <span className="shrink-0 text-xs font-semibold text-graphite">
              {countWords(result, part.groupBy.length > 0)}
            </span>
          </div>
          {result.rows.length === 0 ? (
            <p className="rounded-card border border-line bg-paper p-4 text-sm text-graphite">
              Nothing matches this part right now.
            </p>
          ) : (
            <>
              {part.chart && part.groupBy.length > 0 && (
                <Bars result={result} timeZone={timeZone} />
              )}
              <Cards result={result} timeZone={timeZone} />
              <Table result={result} timeZone={timeZone} />
            </>
          )}
          {result.truncated && (
            <p className="text-xs text-graphite">
              Showing the first {result.rows.length} of {result.total}. Ask the
              assistant to narrow this part.
            </p>
          )}
        </section>
      ))}
    </>
  );
}

function countWords(result: PartResult, grouped: boolean): string {
  const n = result.total;
  return grouped
    ? `${n} group${n === 1 ? "" : "s"}`
    : `${n} row${n === 1 ? "" : "s"}`;
}

const cell = (row: Row, c: Column, timeZone: string) =>
  formatCell(row[c.key], c, timeZone);

/** Phone: one card per row — the first column bold, the rest labelled. */
function Cards({ result, timeZone }: { result: PartResult; timeZone: string }) {
  const [first, ...rest] = result.columns;
  return (
    <ul className="flex flex-col gap-2.5 md:hidden">
      {result.rows.map((row, i) => (
        <li
          key={i}
          className="flex flex-col gap-1 rounded-card border border-line bg-paper px-3.5 py-3"
        >
          <span className="text-[15px] font-bold wrap-anywhere">
            {cell(row, first, timeZone)}
          </span>
          {rest.map((c) => (
            <span key={c.key} className="text-xs wrap-anywhere">
              <span className="text-graphite">{c.label}:</span>{" "}
              {cell(row, c, timeZone)}
            </span>
          ))}
        </li>
      ))}
    </ul>
  );
}

/** Wide screens: a table that scrolls inside its own box if needed. */
function Table({ result, timeZone }: { result: PartResult; timeZone: string }) {
  return (
    <div className="hidden overflow-x-auto rounded-card border border-line bg-paper md:block">
      <table className="w-full text-left text-[13px]">
        <thead>
          <tr className="border-b border-line">
            {result.columns.map((c) => (
              <th key={c.key} scope="col" className="px-3 py-2 font-semibold">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.rows.map((row, i) => (
            <tr key={i} className="border-b border-line-subtle last:border-b-0">
              {result.columns.map((c) => (
                <td key={c.key} className="px-3 py-2 align-top">
                  {cell(row, c, timeZone)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** One ink bar per group, scaled to the biggest; the value written beside. */
function Bars({ result, timeZone }: { result: PartResult; timeZone: string }) {
  // Group columns first, then the measures; the bar is the first measure.
  const keyCols = result.columns.slice(
    0,
    result.columns.length - countMeasures(result),
  );
  const valueCol = result.columns[keyCols.length];
  if (!valueCol) return null;
  const values = result.rows.map((r) =>
    typeof r[valueCol.key] === "number" ? (r[valueCol.key] as number) : 0,
  );
  const max = Math.max(1, ...values);
  return (
    <figure className="flex flex-col gap-2 rounded-card border border-line bg-paper p-3.5">
      <figcaption className="text-xs font-semibold text-graphite">
        {valueCol.label}
      </figcaption>
      <ul className="flex flex-col gap-2">
        {result.rows.map((row, i) => (
          <li
            key={i}
            className="grid grid-cols-[8rem_minmax(0,1fr)] items-center gap-2.5 md:grid-cols-[14rem_minmax(0,1fr)]"
          >
            <span className="truncate text-[13px]">
              {keyCols.map((c) => cell(row, c, timeZone)).join(" · ")}
            </span>
            <span className="flex min-w-0 items-center gap-1.5">
              <span
                aria-hidden="true"
                className="h-3 shrink-0 rounded-r-[4px] bg-ink"
                style={{
                  width: `${Math.round((values[i] / max) * 800) / 10}%`,
                }}
              />
              <span className="text-xs font-semibold tabular-nums">
                {cell(row, valueCol, timeZone)}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

/** Grouped results end with their measures: count or "<fn>_<field>". */
function countMeasures(result: PartResult): number {
  return result.columns.filter(
    (c) => c.key === "count" || /^(avg|min|max|sum)_/.test(c.key),
  ).length;
}

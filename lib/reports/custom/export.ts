import type { ReportPdfSection } from "@/lib/reports/ReportPdf";
import type { PartOutcome } from "./store";
import { formatCell, partWords } from "./words";

/**
 * A custom report as files (F17a): the same values as on the page, in
 * words people read (company-time days, durations, months).
 */

/** "custom-report_dubai-joiners-with-slack.csv". */
export function customFileName(title: string, ext: "csv" | "pdf" | "xlsx") {
  const slug =
    title
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60)
      .replace(/-+$/, "") || "report";
  return `custom-report_${slug}.${ext}`;
}

/**
 * CSV: one file for every part — a Part column first, then every column
 * any part has (in the order they first appear), empty where a part
 * doesn't have it.
 */
export function customCsv(outcomes: PartOutcome[], timeZone: string) {
  const labels: string[] = [];
  for (const { result } of outcomes)
    for (const c of result.columns)
      if (!labels.includes(c.label)) labels.push(c.label);
  const body = outcomes.flatMap(({ part, result }, i) =>
    result.rows.map((row) => {
      const byLabel = new Map(
        result.columns.map((c) => [
          c.label,
          formatCell(row[c.key], c, timeZone),
        ]),
      );
      return [
        `${i + 1} · ${part.title}`,
        ...labels.map((l) => {
          const v = byLabel.get(l);
          return v === undefined || v === "—" ? null : v;
        }),
      ];
    }),
  );
  return { header: ["Part", ...labels], body };
}

/** Grouped results end with their measures: count or "<fn>_<field>". */
const isMeasure = (key: string) =>
  key === "count" || /^(avg|min|max|sum)_/.test(key);

/** PDF: one section per part — how it is built, a chart if asked, the table. */
export function customPdfSections(
  outcomes: PartOutcome[],
  timeZone: string,
): ReportPdfSection[] {
  return outcomes.map(({ part, result }, i) => {
    const groups = result.columns.filter((c) => !isMeasure(c.key));
    const measure = result.columns.find((c) => isMeasure(c.key));
    const chart =
      part.chart && part.groupBy.length > 0 && measure
        ? {
            title: measure.label,
            // The PDF has room for about 24 bars.
            bars: result.rows.slice(0, 24).map((row) => ({
              label: groups
                .map((c) => formatCell(row[c.key], c, timeZone))
                .join(" · "),
              value:
                typeof row[measure.key] === "number"
                  ? (row[measure.key] as number)
                  : 0,
              text: formatCell(row[measure.key], measure, timeZone),
            })),
          }
        : undefined;
    const n = result.total;
    return {
      title: `${outcomes.length > 1 ? `${i + 1} · ` : ""}${part.title}`,
      note: `${partWords(part)} · ${n} ${part.groupBy.length ? "group" : "row"}${n === 1 ? "" : "s"}${
        result.truncated ? ` (first ${result.rows.length} shown)` : ""
      }`,
      chart,
      table: {
        columns: result.columns.map((c, j) => ({
          label: c.label,
          width: j === 0 ? 1.5 : 1,
          align: isMeasure(c.key) ? ("right" as const) : ("left" as const),
        })),
        rows: result.rows.map((row) =>
          result.columns.map((c) => formatCell(row[c.key], c, timeZone)),
        ),
      },
      empty: "Nothing matches this part right now.",
    };
  });
}

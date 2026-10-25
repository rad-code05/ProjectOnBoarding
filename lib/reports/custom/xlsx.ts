import "server-only";
import writeXlsxFile, { type Sheet } from "write-excel-file/node";
import type { PartOutcome } from "./store";
import { formatCell } from "./words";

/**
 * A custom report as Excel (F17a-5): one sheet per part, a bold header row
 * that stays at the top, widths from the content. Values are written as
 * text (as on the page) — strings are never formulas — except counts and
 * other plain numbers, which stay numbers so Excel can add them up.
 */

/** Excel sheet names: ≤ 31 characters, none of [ ] : * ? / \, unique. */
export function sheetName(title: string, index: number, taken: Set<string>) {
  const clean =
    title
      .replace(/[[\]:*?/\\]/g, " ")
      .replace(/\s+/g, " ")
      .trim() || `Part ${index + 1}`;
  let name = `${index + 1} ${clean}`.slice(0, 31).trim();
  for (let n = 2; taken.has(name.toLowerCase()); n++)
    name = `${name.slice(0, 27).trim()} (${n})`;
  taken.add(name.toLowerCase());
  return name;
}

export function customSheets(
  outcomes: PartOutcome[],
  timeZone: string,
): Sheet<Buffer>[] {
  const taken = new Set<string>();
  return outcomes.map(({ part, result }, i) => {
    const header = result.columns.map((c) => ({
      value: c.label,
      fontWeight: "bold" as const,
    }));
    const rows = result.rows.map((row) =>
      result.columns.map((c) => {
        const v = row[c.key];
        if (typeof v === "number" && c.type === "number") return v;
        const text = formatCell(v, c, timeZone);
        return text === "—" ? null : text;
      }),
    );
    const widths = result.columns.map((c, j) =>
      Math.min(
        50,
        Math.max(
          8,
          c.label.length + 2,
          ...rows.map((r) => String(r[j] ?? "").length + 2),
        ),
      ),
    );
    return {
      sheet: sheetName(part.title, i, taken),
      data: [header, ...rows],
      columns: widths.map((width) => ({ width })),
      stickyRowsCount: 1,
    };
  });
}

/** The .xlsx file. */
export async function customXlsx(
  outcomes: PartOutcome[],
  timeZone: string,
): Promise<Buffer> {
  return writeXlsxFile(customSheets(outcomes, timeZone)).toBuffer();
}

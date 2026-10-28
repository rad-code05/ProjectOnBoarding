/**
 * Batch requests (F17b-2): a list of people as a table — from a .csv, a
 * pasted list (copied from Excel = tab-separated) or an .xlsx sheet. Every
 * cell is plain text and only ever data: nothing in it is run or obeyed.
 * Pure — no I/O (the .xlsx reader is `read-file.ts`).
 */

/** At most this many people per batch (D8). */
export const MAX_ROWS = 50;
/** Files and pasted text up to 1 MB. */
export const MAX_BYTES = 1024 * 1024;
const MAX_COLUMNS = 40;
const MAX_CELL = 500;

export type Table = {
  /** The first row: the column titles as written. */
  headers: string[];
  /** The people, one array of cells per row (same length as headers). */
  rows: string[][];
};

/** A reading problem, in words people read. */
export class BatchReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BatchReadError";
  }
}

/** A cell as plain text: control characters out, spaces tidied, capped. */
export function cleanCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text: string;
  if (value instanceof Date) {
    // Excel dates come as midnight UTC: the calendar day as written.
    text = Number.isNaN(value.getTime())
      ? ""
      : value.toISOString().slice(0, 10);
  } else if (typeof value === "boolean") {
    text = value ? "Yes" : "No";
  } else {
    text = String(value);
  }
  return Array.from(text)
    .map((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code < 32 || code === 127 ? " " : ch;
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_CELL);
}

/**
 * Rows of cells → a table: the first non-empty row is the header, empty
 * rows are dropped, every row padded to the header's width.
 */
export function toTable(raw: unknown[][]): Table {
  const rows = raw
    .map((row) => row.map(cleanCell))
    .filter((row) => row.some((cell) => cell !== ""));
  if (rows.length === 0) throw new BatchReadError("The list is empty.");
  const [first, ...people] = rows;
  // Trailing empty titles (a sheet's unused columns) don't count.
  let width = first.length;
  while (width > 0 && first[width - 1] === "") width -= 1;
  if (width > MAX_COLUMNS) {
    throw new BatchReadError(`The list has more than ${MAX_COLUMNS} columns.`);
  }
  if (people.length === 0) {
    throw new BatchReadError(
      "Only one row was found: the first row holds the column titles, the people come below it.",
    );
  }
  if (people.length > MAX_ROWS) {
    throw new BatchReadError(
      `The list has ${people.length} people — a batch takes up to ${MAX_ROWS}. Split it into smaller lists.`,
    );
  }
  const headers = first.slice(0, width);
  return {
    headers,
    rows: people.map((row) => headers.map((_, index) => row[index] ?? "")),
  };
}

/** The separator of a delimited text: tab (copied from Excel), ";" or ",". */
export function guessDelimiter(text: string): "\t" | ";" | "," {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  if (firstLine.includes("\t")) return "\t";
  const semicolons = firstLine.split(";").length;
  const commas = firstLine.split(",").length;
  return semicolons > commas ? ";" : ",";
}

/**
 * A .csv or pasted list → rows of cells (RFC 4180 quotes: "a, b" and ""
 * inside quotes). A byte-order mark at the start is ignored.
 */
export function parseDelimited(text: string, delimiter = guessDelimiter(text)) {
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"' && cell === "") {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** Text larger than the limit is refused before it is read. */
export function checkSize(bytes: number) {
  if (bytes > MAX_BYTES) {
    throw new BatchReadError("The list is larger than 1 MB.");
  }
}

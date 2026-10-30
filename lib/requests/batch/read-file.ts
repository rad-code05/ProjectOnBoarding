import "server-only";
import { readSheet } from "read-excel-file/node";
import type { Database } from "@/lib/supabase/database.types";
import {
  guessBatchKind,
  looksLikeTable,
  matchColumns,
  toRecords,
  type BatchRecord,
  type ColumnMatch,
} from "./columns";
import {
  BatchReadError,
  checkSize,
  parseDelimited,
  toTable,
  type Table,
} from "./table";

type RequestType = Database["public"]["Enums"]["request_type"];

export type ReadList =
  | {
      kind: "table";
      /** The kind of requests (as chosen, or guessed from the titles). */
      type: RequestType;
      table: Table;
      columns: ColumnMatch[];
      records: BatchRecord[];
    }
  /** Pasted text that isn't a table: the assistant reads it (F17b-4). */
  | { kind: "text"; text: string };

const XLSX = [0x50, 0x4b, 0x03, 0x04]; // a zip file: "PK.."

/**
 * An uploaded .xlsx (the first sheet) or .csv → the table, its columns and
 * one record per person. The file type is checked by its content, not only
 * its name; anything else is refused. Nothing in the file is ever run.
 * `"auto"` (a file attached in the chat): the kind follows its titles.
 */
export async function readBatchFile(
  fileName: string,
  bytes: Uint8Array,
  kind: RequestType | "auto",
): Promise<ReadList> {
  checkSize(bytes.byteLength);
  const name = fileName.toLowerCase();
  const isZip = XLSX.every((b, i) => bytes[i] === b);
  let table: Table;
  if (name.endsWith(".xlsx")) {
    if (!isZip) throw new BatchReadError("This .xlsx file can't be read.");
    let rows: unknown[][];
    try {
      rows = (await readSheet(Buffer.from(bytes))) as unknown[][];
    } catch {
      throw new BatchReadError(
        "This .xlsx file can't be read. Save it again from Excel, or export it as .csv.",
      );
    }
    table = toTable(rows);
  } else if (name.endsWith(".csv")) {
    if (isZip) throw new BatchReadError("This file isn't a .csv.");
    table = toTable(parseDelimited(new TextDecoder().decode(bytes)));
  } else {
    throw new BatchReadError("Upload an .xlsx or a .csv file.");
  }
  const type = kind === "auto" ? guessBatchKind(table.headers) : kind;
  const columns = matchColumns(table.headers, type);
  return {
    kind: "table",
    type,
    table,
    columns,
    records: toRecords(table, columns),
  };
}

/**
 * Pasted text: a table when its first row has titles the list understands
 * (copied from Excel, or comma-separated), else free text for the assistant.
 */
export function readPastedList(text: string, type: RequestType): ReadList {
  checkSize(new TextEncoder().encode(text).byteLength);
  const trimmed = text.trim();
  if (!trimmed) throw new BatchReadError("The list is empty.");
  const rows = parseDelimited(trimmed);
  const firstRow = rows[0] ?? [];
  if (firstRow.length >= 2 && looksLikeTable(firstRow, type)) {
    const table = toTable(rows);
    const columns = matchColumns(table.headers, type);
    return {
      kind: "table",
      type,
      table,
      columns,
      records: toRecords(table, columns),
    };
  }
  return { kind: "text", text: trimmed };
}

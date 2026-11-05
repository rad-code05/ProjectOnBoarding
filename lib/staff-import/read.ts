import "server-only";
import { readSheet } from "read-excel-file/node";
import { toRecords, type BatchRecord } from "@/lib/requests/batch/columns";
import {
  BatchReadError,
  checkSize,
  parseDelimited,
  toTable,
} from "@/lib/requests/batch/table";
import { MAX_PEOPLE, matchImportColumns } from "./columns";

const XLSX = [0x50, 0x4b, 0x03, 0x04]; // a zip file: "PK.."
/** The person's columns + one per application, with room to spare. */
const MAX_COLUMNS = 120;

/**
 * The import file (F24b): an .xlsx (its first sheet) or a .csv → one record
 * per person. Read like a batch file — the type checked by its content,
 * every cell plain text, nothing in it run — with the import's own limits.
 */
export async function readImportFile(
  fileName: string,
  bytes: Uint8Array,
): Promise<BatchRecord[]> {
  checkSize(bytes.byteLength);
  const name = fileName.toLowerCase();
  const isZip = XLSX.every((b, i) => bytes[i] === b);
  let raw: unknown[][];
  if (name.endsWith(".xlsx")) {
    if (!isZip) throw new BatchReadError("This .xlsx file can't be read.");
    try {
      raw = (await readSheet(Buffer.from(bytes))) as unknown[][];
    } catch {
      throw new BatchReadError(
        "This .xlsx file can't be read. Save it again from Excel, or export it as .csv.",
      );
    }
  } else if (name.endsWith(".csv")) {
    if (isZip) throw new BatchReadError("This file isn't a .csv.");
    raw = parseDelimited(new TextDecoder().decode(bytes));
  } else {
    throw new BatchReadError("Upload an .xlsx or a .csv file.");
  }
  const table = toTable(raw, {
    rows: MAX_PEOPLE,
    columns: MAX_COLUMNS,
    noun: "an import",
  });
  return toRecords(table, matchImportColumns(table.headers));
}

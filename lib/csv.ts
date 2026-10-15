/** Excel would run a cell starting with these as a formula. */
const FORMULA_START = /^[=+\-@\t\r]/;

type Cell = string | number | null | undefined;

/**
 * One CSV cell: quoted when needed, quotes doubled, and a leading ' when the
 * text could be read as a spreadsheet formula (CSV injection).
 */
export function csvCell(value: Cell): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (FORMULA_START.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** A whole CSV file Excel opens correctly: UTF-8 BOM, CRLF line ends. */
export function toCsv(header: string[], rows: Cell[][]): string {
  const lines = [header, ...rows].map((row) => row.map(csvCell).join(","));
  return `﻿${lines.join("\r\n")}\r\n`;
}

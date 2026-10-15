import { ROLE_LABELS } from "@/lib/navigation";
import { TYPE_LABELS } from "@/lib/requests/labels";
import type { Database } from "@/lib/supabase/database.types";
import { describeEvent } from "./describe";
import { GROUP_LABELS, type AuditGroup } from "./filters";

export type ExportRow =
  Database["public"]["Functions"]["export_audit_log"]["Returns"][number];

/** Excel would run a cell starting with these as a formula. */
const FORMULA_START = /^[=+\-@\t\r]/;

/**
 * One CSV cell: quoted when needed, quotes doubled, and a leading ' when the
 * text could be read as a spreadsheet formula (CSV injection).
 */
export function csvCell(value: string | number | null | undefined): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (FORMULA_START.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** "Asia/Dubai" → "Dubai". */
const city = (timeZone: string) =>
  (timeZone.split("/").at(-1) ?? timeZone).replaceAll("_", " ");

/**
 * The audit log as CSV (Excel opens it: UTF-8 with BOM, CRLF), one row per
 * event, newest first: plain words plus the raw stored values ("Details").
 */
export function auditCsv(
  rows: ExportRow[],
  timeZone: string,
  people: Record<string, string>,
): string {
  const header = [
    "Event #",
    "Time (UTC)",
    `Time (${city(timeZone)})`,
    "Who",
    "Email",
    "Roles",
    "Source",
    "Group",
    "What happened",
    "Ticket",
    "Person",
    "Request type",
    "Details",
  ];
  // "15 Oct 2026, 11:25:59" — to the second, like the details sheet.
  const local = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone,
  });
  const lines = rows.map((row) => {
    const text = describeEvent(row, { people });
    const at = new Date(row.created_at);
    return [
      row.id,
      at.toISOString(),
      local.format(at),
      text.who,
      row.actor_email,
      (row.actor_roles ?? []).map((r) => ROLE_LABELS[r]).join(", "),
      text.chip,
      GROUP_LABELS[row.group_key as AuditGroup]?.label ?? row.group_key,
      text.what,
      row.ticket_id,
      row.employee_name,
      row.request_type ? TYPE_LABELS[row.request_type] : null,
      JSON.stringify(row.diff),
    ]
      .map(csvCell)
      .join(",");
  });
  return `\uFEFF${[header.map(csvCell).join(","), ...lines].join("\r\n")}\r\n`;
}

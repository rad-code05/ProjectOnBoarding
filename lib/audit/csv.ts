import { ROLE_LABELS } from "@/lib/navigation";
import { TYPE_LABELS } from "@/lib/requests/labels";
import type { Database } from "@/lib/supabase/database.types";
import { csvCell, toCsv } from "@/lib/csv";
import { describeEvent } from "./describe";
import { GROUP_LABELS, type AuditGroup } from "./filters";

export { csvCell };

export type ExportRow =
  Database["public"]["Functions"]["export_audit_log"]["Returns"][number];

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
    ];
  });
  return toCsv(header, lines);
}

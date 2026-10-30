import { BATCH_FIELDS } from "./columns";
import type { Problem } from "./onboarding";

/**
 * Batch pages (F17b-3b, pure): what the grid shows for a row — its name,
 * its state, the counts in the tiles and the footer.
 */

export type RowState = "ready" | "attention" | "left_out";

export type ViewRow = {
  position: number;
  included: boolean;
  values: Record<string, string>;
  problems: Problem[];
};

/** "Meera Nair" — first + last, else the full name, else the email, else "Row 3". */
export function rowName(row: ViewRow): string {
  const v = row.values;
  const name =
    [v.firstName, v.lastName].filter(Boolean).join(" ") ||
    v.fullName ||
    v.person;
  return name || v.workEmail || `Row ${row.position}`;
}

export function rowState(row: ViewRow): RowState {
  if (!row.included) return "left_out";
  return row.problems.length ? "attention" : "ready";
}

export const STATE_WORDS: Record<RowState, string> = {
  ready: "Ready",
  attention: "Needs attention",
  left_out: "Left out",
};

export function batchCounts(rows: ViewRow[]) {
  const counts = { ready: 0, attention: 0, left_out: 0 };
  for (const r of rows) counts[rowState(r)] += 1;
  return counts;
}

/** Rows with problems first, then ready, then left out — in list order. */
export function sortForGrid<T extends ViewRow>(rows: T[]): T[] {
  const order: Record<RowState, number> = {
    attention: 0,
    ready: 1,
    left_out: 2,
  };
  return [...rows].sort(
    (a, b) =>
      order[rowState(a)] - order[rowState(b)] || a.position - b.position,
  );
}

/** The field's label in its template ("startDate" → "Start date", "person" → "Name or work email"). */
export function fieldLabel(field: string): string {
  return (
    Object.values(BATCH_FIELDS)
      .flat()
      .find((f) => f.key === field)?.label ?? field
  );
}

/** "1 left out" / "2 need attention" — the footer line. */
export function footerLine(counts: ReturnType<typeof batchCounts>): string {
  const parts = [`${counts.ready} ready`];
  if (counts.attention)
    parts.push(
      `${counts.attention} need${counts.attention === 1 ? "s" : ""} attention (not created yet)`,
    );
  if (counts.left_out) parts.push(`${counts.left_out} left out`);
  return parts.join(" · ");
}

/**
 * The onboarding template's own columns, in order (the .xlsx download); one
 * column per active application follows (`templateColumns`).
 */
export const TEMPLATE_COLUMNS = [
  "First name",
  "Last name",
  "Work email",
  "Job title",
  "Department",
  "Office",
  "State",
  "City",
  "Manager",
  "Start date",
  "Nationality",
  "Equipment",
  "Physical access",
  "Requested by",
];

/**
 * Raju's layout (2026-10-29): after the person's columns, one column per
 * application in the catalog — the cell holds the role, "Yes" for its usual
 * role, empty when not needed. A new app in the catalog = a new column.
 */
export function templateColumns(apps: string[]): string[] {
  return [...TEMPLATE_COLUMNS, ...apps];
}

/**
 * The leavers template (F17b-5b): the person and their last day; the rest
 * may stay empty when "Same for everyone" on the batch page covers it.
 */
export const LEAVER_TEMPLATE = BATCH_FIELDS.offboarding.map((f) => f.label);

/** The example leaver (an invented person — a real one would be flagged as unknown). */
export const LEAVER_EXAMPLE: Record<string, string> = {
  person: "arjun.mehta@laine.ai",
  lastWorkingDay: "30/11/2026",
  slaTimeline: "Within 24h",
  cutoffDate: "",
  cutoffTime: "18:00",
  handoverTo: "Line manager",
  removalMethod: "Suspend",
  mailbox: "Convert to a shared mailbox",
};

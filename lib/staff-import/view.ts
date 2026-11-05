import { rowName as batchRowName } from "@/lib/requests/batch/view";
import { formatDay } from "@/lib/requests/format";
import type { Problem } from "@/lib/requests/batch/onboarding";
import { IMPORT_FIELDS } from "./columns";

/**
 * Admin → Import (F24c, pure): what the check grid shows for a row — its
 * state, the tiles' counts, a card's summary — and the Confirm's words.
 */

export type ImportRowState = "ready" | "attention" | "skipped" | "left_out";

export type ImportViewRow = {
  position: number;
  included: boolean;
  values: Record<string, string>;
  problems: Problem[];
  /** "Already in the app: UAM-…" — left out on its own. */
  skipped: string | null;
};

export function importRowState(row: ImportViewRow): ImportRowState {
  if (row.skipped) return "skipped";
  if (!row.included) return "left_out";
  return row.problems.length ? "attention" : "ready";
}

export const IMPORT_STATE_WORDS: Record<ImportRowState, string> = {
  ready: "Ready",
  attention: "Needs attention",
  skipped: "Skipped",
  left_out: "Left out",
};

export const rowName = (row: ImportViewRow) => batchRowName(row);

export function importCounts(rows: ImportViewRow[]) {
  const counts = { ready: 0, attention: 0, skipped: 0, left_out: 0 };
  for (const r of rows) counts[importRowState(r)] += 1;
  return counts;
}

/** Problems first, then ready, then skipped / left out — in file order. */
export function sortImportRows<T extends ImportViewRow>(rows: T[]): T[] {
  const order: Record<ImportRowState, number> = {
    attention: 0,
    ready: 1,
    skipped: 2,
    left_out: 3,
  };
  return [...rows].sort(
    (a, b) =>
      order[importRowState(a)] - order[importRowState(b)] ||
      a.position - b.position,
  );
}

/** A field's label in the template ("leaveDate" → "Leave date"). */
export function importFieldLabel(field: string): string {
  return IMPORT_FIELDS.find((f) => f.key === field)?.label ?? field;
}

/** A YYYY-MM-DD day as the app writes days (the day as written, no timezone). */
export function dayWords(day: string): string {
  return formatDay(`${day}T12:00:00Z`, "UTC");
}

/** How many applications a row lists (catalog + other). */
export function appCount(values: Record<string, string>): number {
  const count = (cell?: string) =>
    (cell ?? "")
      .split(/,(?![^(]*\))/)
      .map((s) => s.trim())
      .filter(Boolean).length;
  return count(values.applications) + count(values.otherApplications);
}

/** "Backend developer · Engineering · Dubai" — a ready card's one line. */
export function cardLine(values: Record<string, string>): string {
  const place = [values.office, values.state, values.city]
    .filter(Boolean)
    .join(" · ");
  return [values.jobTitle, values.department, place]
    .filter(Boolean)
    .join(" · ");
}

/** "36 ready · 2 need attention · 2 skipped" — the footer line. */
export function importFooter(counts: ReturnType<typeof importCounts>): string {
  const parts = [`${counts.ready} ready`];
  if (counts.attention)
    parts.push(
      `${counts.attention} need${counts.attention === 1 ? "s" : ""} attention`,
    );
  if (counts.skipped) parts.push(`${counts.skipped} skipped`);
  if (counts.left_out) parts.push(`${counts.left_out} left out`);
  return parts.join(" · ");
}

/** The Confirm's tiles: who still works here, who left (ready rows only). */
export function confirmSplit(rows: ImportViewRow[]) {
  const ready = rows.filter((r) => importRowState(r) === "ready");
  const leavers = ready.filter((r) => Boolean(r.values.leaveDate)).length;
  return { people: ready.length, working: ready.length - leavers, leavers };
}

/** "Rose Bernal — already in the app" lines for the Confirm. */
export function leftOutLines(rows: ImportViewRow[]): string[] {
  return rows
    .filter((r) => importRowState(r) !== "ready")
    .map((r) => {
      const state = importRowState(r);
      const why =
        state === "skipped"
          ? "already in the app"
          : state === "attention"
            ? "not fixed"
            : "left out";
      return `${rowName(r)} — ${why}`;
    });
}

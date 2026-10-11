import { SECTIONS } from "./sections";

/** The approver's latest return of a request (one `approvals` row). */
export type ReturnInfo = {
  /** "Moises Larez" — who returned it. */
  byName: string;
  /** "Moises" — for "Flagged by Moises" and "Note for Moises". */
  byFirstName: string;
  /** Server time of the decision, e.g. "9 Oct 2026, 14:30". */
  atLabel: string;
  comment: string;
  /** Whole sections to fix (decided 2026-10-09), sorted. */
  flagged: number[];
};

/** Sections that exist on the form, in order, without repeats. */
export function flaggedSections(sections: readonly number[]): number[] {
  return [...new Set(sections)]
    .filter((n) => SECTIONS.some((s) => s.number === n))
    .sort((a, b) => a - b);
}

/** The first flagged section — where "Go to …" jumps — or null. */
export function firstFlagged(
  info: ReturnInfo,
): (typeof SECTIONS)[number] | null {
  const first = info.flagged[0];
  return SECTIONS.find((s) => s.number === first) ?? null;
}

/** "Flagged by Moises" for the flagged sections, or null when not flagged. */
export function flagLabel(
  info: ReturnInfo | null,
  section: number,
): string | null {
  return info?.flagged.includes(section)
    ? `Flagged by ${info.byFirstName}`
    : null;
}

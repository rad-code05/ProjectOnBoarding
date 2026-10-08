import type { RequestType } from "./labels";

/** The 11 sections of form v4, in order (design/main-page.md). */
export type SectionInfo = {
  number: number;
  title: string;
  /** Short name for the section chips on a phone. */
  short: string;
  /** Plan item that builds the section's content. */
  builtIn: string;
};

export const SECTIONS: SectionInfo[] = [
  { number: 1, title: "Ticket information", short: "Ticket", builtIn: "F01" },
  { number: 2, title: "Employee details", short: "Employee", builtIn: "F01" },
  {
    number: 3,
    title: "Final authorization",
    short: "Authorization",
    builtIn: "F07",
  },
  {
    number: 4,
    title: "Provisioning method",
    short: "Provisioning",
    builtIn: "F02",
  },
  { number: 5, title: "Application access", short: "Access", builtIn: "F02" },
  { number: 6, title: "IT equipment", short: "Equipment", builtIn: "F03" },
  {
    number: 7,
    title: "Physical & logical access",
    short: "Physical",
    builtIn: "F03",
  },
  { number: 8, title: "Access removal SLA", short: "SLA", builtIn: "F09" },
  {
    number: 9,
    title: "IT execution confirmation",
    short: "Execution",
    builtIn: "F04",
  },
  {
    number: 10,
    title: "Final review & closure",
    short: "Review",
    builtIn: "F07",
  },
  {
    number: 11,
    title: "Signatures & sign-off",
    short: "Signatures",
    builtIn: "F06",
  },
];

/**
 * Sections someone else or a later step owns — shown locked, with who/when.
 * null = Raju may open it now. (F04 adds the workflow rules.)
 */
export function lockedNote(number: number, type: RequestType): string | null {
  switch (number) {
    case 3:
      return "Moises signs at the end";
    case 8:
      return type === "offboarding" ? null : "Offboarding only";
    case 9:
      return "Opens when execution starts";
    case 10:
      return "Moises · after Review & sign";
    case 11:
      return "After Review & sign";
    default:
      return null;
  }
}

/** "3 to fill" / "Complete" for a section with fields. */
export function fillNote(missing: number): string {
  return missing === 0 ? "Complete" : `${missing} to fill`;
}

import {
  resolveOnboarding,
  type FormOptions,
  type OnboardingInput,
} from "@/lib/ai/tools/onboarding-shared";
import {
  fixApps,
  listItems,
  readDay,
  splitItem,
  toOnboardingInput,
  type Problem,
} from "@/lib/requests/batch/onboarding";

/**
 * Import of existing staff (F24b, pure): one row of the file checked with
 * the batch's own name checks (`resolveOnboarding`: departments, offices,
 * states and cities, nationalities, applications and roles) — except the
 * dates: here, and only here, they may be in the past (they come from the
 * file). A person already in the app is skipped, not imported: their real
 * requests win. The result's `person` is what `import_staff()` writes.
 */

/** What the database writes for one person (keys as `import_staff()` reads them). */
export type ImportPerson = {
  first_name?: string;
  last_name?: string;
  work_email?: string;
  job_title?: string;
  department_id?: number;
  office_id?: number;
  region_id?: number;
  office_city_id?: number;
  country?: string;
  nationalities?: string[];
  manager_name?: string;
  start_date?: string;
  leave_date?: string;
  access: ImportAccess[];
};

export type ImportAccess =
  | { app_id: number; permission: string | null }
  | { name: string; permission: string | null };

export type CheckedImportRow = {
  person: ImportPerson;
  problems: Problem[];
  /** Why the row is left out on its own ("Already in the app: UAM-…"). */
  skipped: string | null;
};

export type ImportContext = {
  options: FormOptions;
  /** Today in the company timezone, YYYY-MM-DD. */
  today: string;
  /** Work emails (lower case) already in the app → their latest ticket. */
  inApp: Map<string, string>;
};

/** Fields every imported person needs. */
export const IMPORT_REQUIRED: { field: string; label: string }[] = [
  { field: "firstName", label: "First name" },
  { field: "lastName", label: "Last name" },
  { field: "workEmail", label: "Work email" },
  { field: "department", label: "Department" },
  { field: "office", label: "Office" },
  { field: "startDate", label: "Start date" },
];

/** Which input keys each field's problems come from (as in batches). */
const GROUPS: [string, (keyof OnboardingInput)[]][] = [
  ["workEmail", ["workEmail"]],
  ["department", ["department"]],
  ["office", ["office", "state", "city"]],
  ["nationalities", ["nationalities"]],
  ["applications", ["applications"]],
];

const notADay = (text: string) =>
  `"${text}" isn't a date — write it like 2025-01-06 or 06/01/2025`;

/** One row on its own (duplicates across the file: `checkImport`). */
export function checkImportRow(
  values: Record<string, string>,
  ctx: ImportContext,
): CheckedImportRow {
  const input = fixApps(toOnboardingInput(values), ctx.options);
  const problems: Problem[] = [];

  for (const r of IMPORT_REQUIRED) {
    const v =
      r.field === "firstName"
        ? input.firstName
        : r.field === "lastName"
          ? input.lastName
          : values[r.field];
    if (!v?.trim())
      problems.push({
        field: r.field,
        message: `${r.label} missing — required`,
      });
  }

  // The dates come from the file: in the past is fine, the future isn't.
  const start = values.startDate ? readDay(values.startDate) : null;
  const leave = values.leaveDate ? readDay(values.leaveDate) : null;
  if (values.startDate && !start)
    problems.push({ field: "startDate", message: notADay(values.startDate) });
  else if (start && start > ctx.today)
    problems.push({
      field: "startDate",
      message: "In the future — use a normal onboarding for new joiners",
    });
  if (values.leaveDate && !leave)
    problems.push({ field: "leaveDate", message: notADay(values.leaveDate) });
  else if (leave && leave > ctx.today)
    problems.push({
      field: "leaveDate",
      message: "In the future — start an offboarding when they leave",
    });
  else if (leave && start && leave < start)
    problems.push({
      field: "leaveDate",
      message: `Before the start date (${start})`,
    });

  // The batch's name checks, one field at a time so each problem names its cell.
  for (const [field, keys] of GROUPS) {
    const part: OnboardingInput = {};
    for (const k of keys) Object.assign(part, { [k]: input[k] });
    if (
      keys.every(
        (k) =>
          input[k] === undefined ||
          (Array.isArray(input[k]) && !(input[k] as unknown[]).length),
      )
    )
      continue;
    const r = resolveOnboarding(part, ctx.options);
    if (!r.ok)
      for (const message of r.problems) problems.push({ field, message });
  }

  // Applications not in the catalog: kept by name (as "Other").
  const others: ImportAccess[] = listItems(values.otherApplications).map(
    (item) => {
      const s = splitItem(item);
      return { name: s.name.slice(0, 80), permission: s.detail ?? null };
    },
  );

  const person = toPerson(input, ctx.options, others);
  if (start) person.start_date = start;
  if (leave) person.leave_date = leave;

  const email = person.work_email;
  const ticket = email ? ctx.inApp.get(email) : undefined;
  return {
    person,
    problems,
    skipped: ticket ? `Already in the app: ${ticket}` : null,
  };
}

/** The checked values → the database's keys (only what resolved). */
function toPerson(
  input: OnboardingInput,
  options: FormOptions,
  others: ImportAccess[],
): ImportPerson {
  const person: ImportPerson = { access: [] };
  const r = resolveOnboarding({ ...input, startDate: undefined }, options);
  // A row with problems still shows what did resolve (field by field).
  const suggestions = r.ok
    ? r.suggestions
    : (
        [
          "firstName",
          "lastName",
          "workEmail",
          "jobTitle",
          "manager",
          "department",
          "office",
          "nationalities",
          "applications",
        ] as const
      ).flatMap((k) => {
        const one = resolveOnboarding(
          k === "office"
            ? { office: input.office, state: input.state, city: input.city }
            : { [k]: input[k] },
          options,
        );
        return one.ok ? one.suggestions : [];
      });
  for (const s of suggestions) {
    if (s.kind === "access") {
      const id = Number(s.target.replace(/^app:/, ""));
      const value = s.value as { permission: string | null };
      person.access.push({ app_id: id, permission: value.permission });
    } else if (s.kind === "field") {
      Object.assign(person, { [s.target]: s.value });
    }
  }
  person.access.push(...others);
  return person;
}

/** Every row, plus the same work email twice in the file (the later rows flagged). */
export function checkImport(
  rows: { position: number; values: Record<string, string> }[],
  ctx: ImportContext,
): Map<number, CheckedImportRow> {
  const out = new Map<number, CheckedImportRow>();
  const seen = new Map<string, number>();
  for (const row of [...rows].sort((a, b) => a.position - b.position)) {
    const checked = checkImportRow(row.values, ctx);
    const email = checked.person.work_email;
    if (email) {
      const first = seen.get(email);
      if (first !== undefined)
        checked.problems.push({
          field: "workEmail",
          message: `The same work email as row ${first}`,
        });
      else seen.set(email, row.position);
    }
    out.set(row.position, checked);
  }
  return out;
}

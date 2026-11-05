import {
  matchFields,
  type BatchField,
  type ColumnMatch,
} from "@/lib/requests/batch/columns";

/**
 * Import of existing staff (F24b, pure): which column holds what. The same
 * matching as batches (titles first, then the names people use); the keys
 * are a joiner's batch keys, so a row is checked with the same name checks,
 * plus the import's own dates. Application columns (one per catalog app,
 * the cell = the role) are joined by `withAppColumns`, as in batches.
 */
export const IMPORT_FIELDS: BatchField[] = [
  {
    key: "firstName",
    label: "First name",
    aliases: ["first", "given name", "forename"],
  },
  {
    key: "lastName",
    label: "Last name",
    aliases: ["last", "surname", "family name"],
  },
  {
    key: "fullName",
    label: "Name",
    aliases: ["full name", "employee", "employee name", "user name", "user"],
  },
  {
    key: "workEmail",
    label: "Work email",
    aliases: ["email", "e-mail", "email address", "mail", "emails"],
  },
  {
    key: "jobTitle",
    label: "Job title",
    aliases: ["title", "role", "position", "positions", "job"],
  },
  {
    key: "department",
    label: "Department",
    aliases: ["team", "dept", "department / team"],
  },
  {
    key: "office",
    label: "Office",
    aliases: ["location", "site", "work location"],
  },
  { key: "state", label: "State", aliases: ["us state"] },
  { key: "city", label: "City", aliases: [] },
  {
    key: "nationalities",
    label: "Nationality",
    aliases: ["nationalities", "citizenship"],
  },
  {
    key: "manager",
    label: "Manager",
    aliases: ["line manager", "reports to", "supervisor"],
  },
  {
    key: "startDate",
    label: "Start date",
    aliases: [
      "start",
      "joining date",
      "joined",
      "first day",
      "hire date",
      "execution date",
    ],
  },
  {
    key: "leaveDate",
    label: "Leave date",
    aliases: [
      "left",
      "leaving date",
      "end date",
      "last working day",
      "last day",
      "removal date",
    ],
  },
  {
    key: "applications",
    label: "Applications",
    aliases: ["apps", "tools", "access", "applications and roles"],
  },
  {
    key: "otherApplications",
    label: "Other applications",
    aliases: ["other apps", "other tools", "not in the catalog"],
  },
];

/** At most this many people per import file. */
export const MAX_PEOPLE = 500;

/** The template's columns: the person, then one per active application. */
export function importTemplateColumns(appNames: string[]): string[] {
  return [
    ...IMPORT_FIELDS.filter(
      (f) => f.key !== "fullName" && f.key !== "applications",
    ).map((f) => f.label),
    ...appNames,
  ];
}

export function matchImportColumns(headers: string[]): ColumnMatch[] {
  return matchFields(headers, IMPORT_FIELDS);
}

import type { Database } from "@/lib/supabase/database.types";
import type { Table } from "./table";

type RequestType = Database["public"]["Enums"]["request_type"];

/**
 * Batch requests (F17b-2): which column holds what. People's own column
 * titles are matched by name ("E-mail", "Work email", "Email address" are
 * all the work email); a column nobody recognises is left for the person or
 * the assistant to place. The field keys are the robot's own (F16 tools), so
 * a row turns into the same checked values as a request by chat.
 */
export type BatchField = {
  key: string;
  /** The template's column title. */
  label: string;
  /** Other titles people use (compared without case, spaces or signs). */
  aliases: string[];
};

const PERSON: BatchField = {
  key: "person",
  label: "Name or work email",
  aliases: [
    "name",
    "full name",
    "employee",
    "person",
    "email",
    "work email",
    "e-mail",
  ],
};

export const BATCH_FIELDS: Record<RequestType, BatchField[]> = {
  onboarding: [
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
      aliases: ["full name", "employee", "employee name", "joiner"],
    },
    {
      key: "workEmail",
      label: "Work email",
      aliases: ["email", "e-mail", "email address", "mail"],
    },
    {
      key: "jobTitle",
      label: "Job title",
      aliases: ["title", "role", "position", "job"],
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
      key: "manager",
      label: "Manager",
      aliases: ["line manager", "reports to", "supervisor"],
    },
    {
      key: "startDate",
      label: "Start date",
      aliases: ["start", "effective date", "joining date", "first day", "date"],
    },
    {
      key: "nationalities",
      label: "Nationality",
      aliases: ["nationalities", "citizenship"],
    },
    {
      key: "applications",
      label: "Applications",
      aliases: [
        "apps",
        "tools",
        "access",
        "software",
        "applications and roles",
      ],
    },
    {
      key: "equipment",
      label: "Equipment",
      aliases: ["devices", "hardware", "laptop"],
    },
    {
      key: "physical",
      label: "Physical access",
      aliases: ["badge", "door access", "building access"],
    },
    {
      key: "requestedBy",
      label: "Requested by",
      aliases: ["requestor", "requester", "requested"],
    },
  ],
  offboarding: [
    PERSON,
    {
      key: "lastWorkingDay",
      label: "Last working day",
      aliases: ["last day", "leaving date", "end date", "date"],
    },
    { key: "slaTimeline", label: "SLA", aliases: ["timeline", "sla timeline"] },
    {
      key: "cutoffDate",
      label: "Cut-off date",
      aliases: ["cutoff date", "access cut-off date"],
    },
    {
      key: "cutoffTime",
      label: "Cut-off time",
      aliases: ["cutoff time", "access cut-off time", "time"],
    },
    {
      key: "handoverTo",
      label: "Handover",
      aliases: ["handover to", "data to", "successor"],
    },
    {
      key: "removalMethod",
      label: "Removal method",
      aliases: ["method", "removal"],
    },
    {
      key: "mailbox",
      label: "Mailbox",
      aliases: ["shared mailbox", "email box"],
    },
  ],
  access_modification: [
    PERSON,
    {
      key: "effectiveDate",
      label: "Effective date",
      aliases: ["date", "from", "start date"],
    },
    {
      key: "change",
      label: "Change",
      aliases: ["changes", "change role", "new role"],
    },
    {
      key: "remove",
      label: "Remove",
      aliases: ["removals", "take away", "revoke"],
    },
    { key: "add", label: "Add", aliases: ["new access", "grant", "additions"] },
  ],
};

/** "E-mail address" → "emailaddress": no case, spaces or signs. */
export function titleKey(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export type ColumnMatch = {
  index: number;
  header: string;
  /** The field it holds, or null when unclear. */
  field: string | null;
};

/**
 * Each column → a field (by its template title first, then an alias), each
 * field at most once (the first column wins; a second one stays unclear).
 */
export function matchColumns(
  headers: string[],
  type: RequestType,
): ColumnMatch[] {
  const fields = BATCH_FIELDS[type];
  const taken = new Set<string>();
  const find = (key: string, useAliases: boolean) =>
    fields.find(
      (f) =>
        !taken.has(f.key) &&
        (titleKey(f.label) === key ||
          titleKey(f.key) === key ||
          (useAliases && f.aliases.some((a) => titleKey(a) === key))),
    );
  const matches: ColumnMatch[] = headers.map((header, index) => ({
    index,
    header,
    field: null,
  }));
  // Exact titles first, so "Start date" isn't taken by the alias "date".
  for (const useAliases of [false, true]) {
    for (const m of matches) {
      if (m.field) continue;
      const key = titleKey(m.header);
      if (!key) continue;
      const f = find(key, useAliases);
      if (f) {
        m.field = f.key;
        taken.add(f.key);
      }
    }
  }
  return matches;
}

/** One person's cells by field (only the matched, non-empty ones). */
export type BatchRecord = {
  /** The row's number in the list (1 = the first person). */
  position: number;
  values: Record<string, string>;
  /** Cells of columns that weren't placed: title → value. */
  other: Record<string, string>;
};

export function toRecords(table: Table, columns: ColumnMatch[]): BatchRecord[] {
  return table.rows.map((row, i) => {
    const values: Record<string, string> = {};
    const other: Record<string, string> = {};
    for (const c of columns) {
      const cell = row[c.index] ?? "";
      if (!cell) continue;
      if (c.field) values[c.field] = cell;
      else if (c.header) other[c.header] = cell;
    }
    return { position: i + 1, values, other };
  });
}

/**
 * Does pasted text look like a table (a title row the list understands)?
 * Otherwise it is free text, read by the assistant (F17b-4).
 */
export function looksLikeTable(headers: string[], type: RequestType): boolean {
  return matchColumns(headers, type).filter((m) => m.field).length >= 2;
}

/**
 * A list attached in the chat (F17b-5d): which kind it is, by its column
 * titles (the template titles and keys, no loose aliases — "Start date" is
 * a joiner's, not an effective date). Role-change columns first, then a
 * leaver's, else joiners.
 */
export function guessBatchKind(headers: string[]): RequestType {
  const keys = new Set(headers.map(titleKey).filter(Boolean));
  const has = (type: RequestType, fields: string[]) =>
    BATCH_FIELDS[type]
      .filter((f) => fields.includes(f.key))
      .some((f) => keys.has(titleKey(f.label)) || keys.has(titleKey(f.key)));
  if (has("access_modification", ["effectiveDate", "change", "remove", "add"]))
    return "access_modification";
  if (
    has("offboarding", [
      "lastWorkingDay",
      "slaTimeline",
      "cutoffDate",
      "cutoffTime",
      "removalMethod",
      "mailbox",
    ]) ||
    ["lastday", "leavingdate"].some((k) => keys.has(k))
  )
    return "offboarding";
  return "onboarding";
}

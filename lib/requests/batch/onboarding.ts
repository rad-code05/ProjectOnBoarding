import {
  resolveOnboarding,
  type FormOptions,
  type OnboardingInput,
  type Suggestion,
} from "@/lib/ai/tools/onboarding-shared";

/**
 * Batch of joiners (F17b-3a, pure): one row of the list — the cells by field
 * (`BATCH_FIELDS.onboarding`) — checked with the robot's own name checks
 * (`resolveOnboarding`: departments, offices, the catalog …) plus what a
 * batch adds: required fields, dates in the past, the same work email twice
 * or already on an open request. Each problem names its field, so the grid
 * outlines that cell. The writes are what the draft gets at Confirm.
 */

export type Problem = { field: string; message: string };

/**
 * What a draft gets at Confirm: the robot's suggestions, plus (leavers) one
 * removal method for every application, applied by `create_batch_drafts()`.
 */
export type BatchWrite =
  | Suggestion
  | { kind: "removal_all"; target: "removal_all"; value: { method: string } };

export type CheckedRow = {
  writes: BatchWrite[];
  problems: Problem[];
};

/** Fields a batch row must have (the form's required ones a list can hold). */
export const REQUIRED: { field: string; label: string }[] = [
  { field: "firstName", label: "First name" },
  { field: "lastName", label: "Last name" },
  { field: "workEmail", label: "Work email" },
  { field: "jobTitle", label: "Job title" },
  { field: "department", label: "Department" },
  { field: "office", label: "Office" },
  { field: "manager", label: "Manager" },
  { field: "startDate", label: "Start date" },
];

/** Items of a list cell: "Slack · Regular Member, GitHub (Member)". */
export function listItems(cell: string | undefined): string[] {
  return (cell ?? "")
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * "Slack · Regular Member", "Slack (Regular Member)", "Slack: Regular
 * Member", "Slack - Regular Member" → the name and its detail.
 */
export function splitItem(item: string): { name: string; detail?: string } {
  // The detail is the last bracket pair, brackets inside it included:
  // "Hexnode (MDM) (Admin)", "Google Cloud (Access Policy Admin (Beta))".
  const text = item.trim();
  if (text.endsWith(")")) {
    let depth = 0;
    for (let i = text.length - 1; i > 0; i--) {
      if (text[i] === ")") depth++;
      else if (text[i] === "(" && --depth === 0) {
        const name = text.slice(0, i).trim();
        if (name)
          return { name, detail: text.slice(i + 1, -1).trim() || undefined };
        break;
      }
    }
  }
  const sep =
    item.match(/^(.+?)\s+(?:·|-|–)\s+(.+)$/) ?? item.match(/^(.+?):\s*(.+)$/);
  if (sep) return { name: sep[1].trim(), detail: sep[2].trim() };
  return { name: item.trim() };
}

/** "2026-11-02", "2/11/2026", "02.11.2026" → "2026-11-02" (day first); null otherwise. */
export function readDay(text: string | undefined): string | null {
  const t = (text ?? "").trim();
  let y: number, m: number, d: number;
  const iso = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const dmy = t.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/);
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (dmy) [y, m, d] = [Number(dmy[3]), Number(dmy[2]), Number(dmy[1])];
  else return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d
  )
    return null;
  return date.toISOString().slice(0, 10);
}

/** A row's cells → what the robot's checks read. */
export function toOnboardingInput(
  values: Record<string, string>,
): OnboardingInput {
  let firstName: string | undefined = values.firstName;
  let lastName: string | undefined = values.lastName;
  if (!firstName && !lastName && values.fullName) {
    const words = values.fullName.trim().split(/\s+/);
    lastName = words.length > 1 ? words.pop() : undefined;
    firstName = words.join(" ");
  }
  const apps = listItems(values.applications).map(splitItem);
  return {
    firstName,
    lastName,
    workEmail: values.workEmail,
    jobTitle: values.jobTitle,
    department: values.department,
    manager: values.manager,
    office: values.office,
    state: values.state,
    city: values.city,
    nationalities: values.nationalities
      ?.split(/[,;/&]|\band\b/)
      .map((s) => s.trim())
      .filter(Boolean),
    startDate: values.startDate
      ? (readDay(values.startDate) ?? values.startDate)
      : undefined,
    applications: apps.map((a) => ({ name: a.name, permission: a.detail })),
    // The type's full name first ("Laptop · macOS") — see fixEquipment.
    equipment: listItems(values.equipment).map((item) => ({ type: item })),
    access: listItems(values.physical).map((item) => {
      const s = splitItem(item);
      return { type: s.name, scope: s.detail };
    }),
  };
}

/** Which input keys each field's problems come from. */
const GROUPS: [string, (keyof OnboardingInput)[]][] = [
  ["workEmail", ["workEmail"]],
  ["startDate", ["startDate"]],
  ["department", ["department"]],
  ["office", ["office", "state", "city"]],
  ["nationalities", ["nationalities"]],
  ["applications", ["applications"]],
  ["equipment", ["equipment"]],
  ["physical", ["access"]],
];

/**
 * Equipment: the cell may be the type's full name ("Laptop · macOS") or a
 * type with a detail ("Laptop (16 GB)") — the full name is tried first.
 */
function fixEquipment(
  input: OnboardingInput,
  options: FormOptions,
): OnboardingInput {
  const known = (name: string) =>
    options.equipment.some((t) => t.name.toLowerCase() === name.toLowerCase());
  return {
    ...input,
    equipment: input.equipment?.map((e) => {
      if (known(e.type)) return { type: e.type };
      const s = splitItem(e.type);
      return { type: s.name, description: s.detail };
    }),
  };
}

const lower = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Several roles typed in one cell of a multi-role app (Google Cloud in
 * Raju's sheet): lines run together and carry project names ("laine-ai-dev
 * Cloud Run Admin Editor"). The catalog's roles are picked out, longest
 * first; project names, "(Beta)" and separators may be left over — anything
 * else, and the cell stays as typed so the check shows it.
 */
export function pickRoles(text: string, roles: string[]): string | null {
  let rest = ` ${lower(text)} `;
  const found: string[] = [];
  for (const role of [...roles].sort((a, b) => b.length - a.length)) {
    const want = ` ${lower(role)} `;
    const spaced = (s: string) =>
      s.replace(/[;,:()]/g, " ").replace(/\s+/g, " ");
    rest = spaced(rest);
    if (rest.includes(want)) {
      found.push(role);
      rest = rest.split(want).join(" ");
    }
  }
  const left = rest
    // Project ids: lower-case words joined by hyphens ("laine-ai-dev").
    .replace(/\b[a-z][a-z0-9]*(?:-[a-z0-9]+)+\b/g, " ")
    .replace(/\bbeta\b/g, " ")
    .replace(/[\s;,:()]+/g, "");
  return found.length && !left ? found.join("; ") : null;
}

/**
 * Applications as the catalog knows them: an app whose own name has a
 * bracket ("Hexnode (MDM)") isn't a role; several roles in one cell of a
 * multi-role app are picked out (`pickRoles`).
 */
function fixApps(
  input: OnboardingInput,
  options: FormOptions,
): OnboardingInput {
  const app = (name: string) =>
    options.apps.find((a) => lower(a.name) === lower(name));
  return {
    ...input,
    applications: input.applications?.map((a) => {
      const whole = a.permission
        ? app(`${a.name} (${a.permission})`)
        : undefined;
      if (whole) return { name: whole.name };
      const known = app(a.name);
      if (known?.multiple && a.permission) {
        const picked = pickRoles(a.permission, known.permissions);
        if (picked) return { ...a, permission: picked };
      }
      return a;
    }),
  };
}

export type BatchContext = {
  options: FormOptions;
  /** Today in the company timezone, YYYY-MM-DD. */
  today: string;
  /** Work emails (lower case) already on an open request. */
  openEmails: Set<string>;
};

/** One row on its own (the batch-wide duplicate check is `checkOnboardingBatch`). */
export function checkOnboardingRow(
  values: Record<string, string>,
  ctx: BatchContext,
): CheckedRow {
  const input = fixApps(
    fixEquipment(toOnboardingInput(values), ctx.options),
    ctx.options,
  );
  const problems: Problem[] = [];

  for (const r of REQUIRED) {
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
  if (values.startDate && !readDay(values.startDate)) {
    problems.push({
      field: "startDate",
      message: `"${values.startDate}" isn't a date — write it like 2026-11-02 or 02/11/2026`,
    });
  } else if (input.startDate && input.startDate < ctx.today) {
    problems.push({
      field: "startDate",
      message: "In the past — dates are never backdated",
    });
  }

  // The robot's checks, one field at a time so each problem names its cell.
  for (const [field, keys] of GROUPS) {
    if (field === "startDate") continue;
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

  const email = input.workEmail?.trim().toLowerCase();
  if (email && ctx.openEmails.has(email)) {
    problems.push({
      field: "workEmail",
      message: `${email} already has an open request`,
    });
  }

  const all = resolveOnboarding(input, ctx.options);
  const writes = all.ok ? all.suggestions : [];
  if (values.requestedBy?.trim()) {
    writes.push({
      kind: "field",
      target: "requestor_name",
      value: values.requestedBy.trim(),
    });
  }
  return { writes, problems };
}

/** Every row, plus the same work email twice in the list (the later rows flagged). */
export function checkOnboardingBatch(
  rows: { position: number; values: Record<string, string> }[],
  ctx: BatchContext,
): Map<number, CheckedRow> {
  const out = new Map<number, CheckedRow>();
  const seen = new Map<string, number>();
  for (const row of [...rows].sort((a, b) => a.position - b.position)) {
    const checked = checkOnboardingRow(row.values, ctx);
    const email = row.values.workEmail?.trim().toLowerCase();
    if (email) {
      const first = seen.get(email);
      if (first !== undefined) {
        checked.problems.push({
          field: "workEmail",
          message: `The same work email as row ${first}`,
        });
      } else seen.set(email, row.position);
    }
    out.set(row.position, checked);
  }
  return out;
}

/** "Yes", "x", "✓" in an application's column: the app with its usual role. */
const YES = /^(yes|y|x|✓|✔|true|1|default)$/i;
/** "No", "No Access", "-", "n/a": not this app. */
const NO = /^(no|no\s*access|n|-|–|n\/a|none|false|0)$/i;

const appKey = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/**
 * The names people give the apps in their own sheets (Raju's access sheet,
 * 2026-10-29) → the catalog's name, compared like titles.
 */
const APP_ALIASES: Record<string, string> = {
  m365: "office365",
  microsoft365: "office365",
  o365: "office365",
  gcpworkspace: "googleworkspace",
  gsuite: "googleworkspace",
  gcpcloud: "googlecloud",
  gcp: "googlecloud",
};

/** Every title an app answers to: "Hexnode (MDM)" → hexnodemdm, hexnode; "resend.com" → resend. */
function appKeys(name: string): string[] {
  const keys = [
    appKey(name),
    appKey(name.replace(/\s*\(.*\)\s*$/, "")),
    appKey(name.replace(/\.(com|io|ai|net|org)$/i, "")),
  ];
  return [...new Set(keys.filter(Boolean))];
}

/**
 * Raju's template (2026-10-29): one column per application, titled with its
 * catalog name, the cell = the role ("Regular Member"; "Yes" = its usual
 * role; empty or "No" = not needed). Those columns join the Applications
 * cell; a new app in the catalog is just a new column.
 */
export function withAppColumns(
  record: { values: Record<string, string>; other: Record<string, string> },
  apps: { name: string }[],
): { values: Record<string, string>; other: Record<string, string> } {
  const byKey = new Map<string, string>();
  for (const a of apps)
    for (const key of appKeys(a.name))
      if (!byKey.has(key)) byKey.set(key, a.name);
  const find = (title: string) =>
    appKeys(title)
      .map((k) => byKey.get(APP_ALIASES[k] ?? k))
      .find(Boolean);
  const items: string[] = [];
  const other: Record<string, string> = {};
  for (const [title, cell] of Object.entries(record.other)) {
    const app = find(title);
    if (!app) {
      other[title] = cell;
      continue;
    }
    const value = cell.trim();
    if (!value || NO.test(value)) continue;
    // Several roles in one cell ("Viewer, Editor") stay one item.
    const role = value.replace(/\s*[,\n]\s*/g, "; ");
    items.push(YES.test(value) ? app : `${app} (${role})`);
  }
  if (!items.length) return { values: record.values, other };
  const existing = record.values.applications?.trim();
  return {
    values: {
      ...record.values,
      applications: [existing, ...items].filter(Boolean).join(", "),
    },
    other,
  };
}

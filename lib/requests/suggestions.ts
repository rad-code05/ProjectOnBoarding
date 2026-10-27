import { formatDate, formatDayTime } from "@/lib/requests/format";
import { countryName } from "@/lib/requests/labels";
import { zonedParts } from "@/lib/time/zoned";
import { MAILBOX_LABELS, type MailboxHandling } from "./offboarding";
import type { DraftFieldKey, DraftFormValues } from "./draft";

/**
 * The assistant's suggestions on a request (F16b), shaped for the form: a
 * field suggestion knows the form key it fills and the form value it sets
 * (the database keeps column values — "department_id": 3 — the form keeps
 * strings — department: "3"); every suggestion has the words people read.
 * Pure: the loader passes the rows and the names.
 */

export type SuggestionRow = {
  id: string;
  kind: string;
  target: string;
  value: unknown;
  reason: string | null;
};

export type FieldSuggestion = {
  id: string;
  /** The form field it fills (cut-off date + time: "cutoff_date"). */
  key: DraftFieldKey;
  /** What accepting sets in the form (all strings, like typing). */
  patch: Partial<DraftFormValues>;
  /** The value as people read it ("Engineering", "26 Oct 2026"). */
  shown: string;
  reason: string | null;
};

export type ItemSuggestion = {
  id: string;
  /** held: a change to something the person holds (access change, F16d-2). */
  kind: "access" | "equipment" | "physical" | "held" | "removal" | "mailbox";
  /** "Slack", "Laptop", "Office access". */
  name: string;
  /** "Grant · Regular Member", "Issue · Dell 14\"", "Grant · Badge". */
  detail: string;
  reason: string | null;
};

export type Suggestions = {
  fields: FieldSuggestion[];
  items: ItemSuggestion[];
  /** Everything still waiting (the banner and the robot's badge). */
  total: number;
};

export const NO_SUGGESTIONS: Suggestions = { fields: [], items: [], total: 0 };

/** Database column → form key (the rest are the same name). */
const FORM_KEYS: Record<string, DraftFieldKey> = {
  department_id: "department",
  office_id: "office",
  region_id: "region",
  office_city_id: "office_city",
  access_cutoff_at: "cutoff_date",
};

export type SuggestionNames = {
  /** A select-like field's label for a form value (department, office …). */
  choice: (key: DraftFieldKey, value: string) => string | undefined;
  apps: Map<number, string>;
  equipment: Map<number, string>;
  physical: Map<number, string>;
  /** What the person holds (access change): inventory id → name. */
  held?: Map<string, string>;
  /** Offboarding application rows: row id → app name (removal method). */
  rows?: Map<string, string>;
  /** Cut-off times are typed (and shown) in the company timezone. */
  companyTimeZone: string;
};

const humanize = (v: string) => {
  const words = v.replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
};

const asText = (v: unknown): string =>
  v === null || v === undefined
    ? ""
    : Array.isArray(v)
      ? v.map(String).join(",")
      : String(v);

function fieldSuggestion(
  row: SuggestionRow,
  names: SuggestionNames,
): FieldSuggestion | null {
  const key = FORM_KEYS[row.target] ?? (row.target as DraftFieldKey);
  if (row.target === "access_cutoff_at") {
    const iso = asText(row.value);
    if (!iso) return null;
    const { date, time } = zonedParts(iso, names.companyTimeZone);
    return {
      id: row.id,
      key,
      patch: { cutoff_date: date, cutoff_time: time },
      shown: formatDayTime(iso, names.companyTimeZone),
      reason: row.reason,
    };
  }
  const value = asText(row.value);
  let shown = value;
  if (key === "country") shown = value ? countryName(value) : "";
  else if (key === "nationalities")
    shown = value.split(",").filter(Boolean).map(countryName).join(", ");
  else if (key === "effective_date" || key === "last_working_day")
    shown = formatDate(value);
  else if (key === "priority" || key === "sla_timeline")
    shown = names.choice(key, value) ?? humanize(value);
  else shown = names.choice(key, value) ?? value;
  return {
    id: row.id,
    key,
    patch: { [key]: value },
    shown: shown || "—",
    reason: row.reason,
  };
}

const ITEM_KINDS = {
  access: { prefix: "app", names: "apps" },
  equipment: { prefix: "equipment", names: "equipment" },
  physical: { prefix: "access", names: "physical" },
} as const;

function itemSuggestion(
  row: SuggestionRow,
  names: SuggestionNames,
): ItemSuggestion | null {
  if (row.kind === "removal") {
    const v = (row.value ?? {}) as Record<string, unknown>;
    return {
      id: row.id,
      kind: "removal",
      name:
        names.rows?.get(row.target.replace("removal:", "")) ?? "An application",
      detail: `Removal method: ${String(v.method ?? "")}`,
      reason: row.reason,
    };
  }
  if (row.kind === "mailbox") {
    const value = String(row.value ?? "") as MailboxHandling;
    return {
      id: row.id,
      kind: "mailbox",
      name: "Mailbox",
      detail: MAILBOX_LABELS[value] ?? value,
      reason: row.reason,
    };
  }
  if (row.kind === "held") {
    const v = (row.value ?? {}) as Record<string, unknown>;
    return {
      id: row.id,
      kind: "held",
      name:
        names.held?.get(row.target.replace("held:", "")) ?? "An item they hold",
      detail: [v.action, v.value].filter(Boolean).map(String).join(" · "),
      reason: row.reason,
    };
  }
  if (!(row.kind in ITEM_KINDS)) return null;
  const kind = row.kind as keyof typeof ITEM_KINDS;
  const { prefix, names: list } = ITEM_KINDS[kind];
  const id = Number(row.target.replace(`${prefix}:`, ""));
  const v = (row.value ?? {}) as Record<string, unknown>;
  const second =
    kind === "access"
      ? v.permission
      : kind === "equipment"
        ? v.description
        : v.scope;
  return {
    id: row.id,
    kind,
    name: names[list].get(id) ?? row.target,
    detail: [v.action, second].filter(Boolean).map(String).join(" · "),
    reason: row.reason,
  };
}

/** Waiting suggestion rows → what the form shows. Unknown ones are skipped. */
export function buildSuggestions(
  rows: SuggestionRow[],
  names: SuggestionNames,
): Suggestions {
  const fields: FieldSuggestion[] = [];
  const items: ItemSuggestion[] = [];
  for (const row of rows) {
    if (row.kind === "field") {
      const f = fieldSuggestion(row, names);
      if (f) fields.push(f);
    } else {
      const i = itemSuggestion(row, names);
      if (i) items.push(i);
    }
  }
  return { fields, items, total: fields.length + items.length };
}

import { countryName } from "@/lib/requests/labels";
import { zonedParts } from "@/lib/time/zoned";
import { fieldOf, type DatasetKey, type FieldType, type Row } from "./datasets";
import {
  LIMITS,
  measureKey,
  type Condition,
  type Part,
  type Where,
} from "./definition";

/**
 * Applies one part of a checked definition to the rows the reader was
 * allowed to read (F17a). Pure: no database, no clock except the rows'
 * own times, shown and compared as company-time days.
 */

export type Column = {
  key: string;
  label: string;
  type: FieldType;
  /** ISO country codes: shown (and sorted) as full country names. */
  country?: boolean;
};
export type PartResult = {
  columns: Column[];
  rows: Row[];
  /** Rows (or groups) that matched, before the limit. */
  total: number;
  truncated: boolean;
};

type Value = Row[string];

/** The company-time day of a date or a moment: "2026-10-06". */
function dayOf(v: Value, type: FieldType, timeZone: string): string | null {
  if (typeof v !== "string" || !v) return null;
  return type === "datetime" ? zonedParts(v, timeZone).date : v.slice(0, 10);
}

const norm = (v: unknown) =>
  typeof v === "string" ? v.trim().toLowerCase() : v;

/** Text or each value of a list. */
const valuesOf = (v: Value): unknown[] =>
  Array.isArray(v) ? v : v === null ? [] : [v];

/** "Slack · Regular Member" held, asked as item "slack" (+ role). */
function holdsItem(holds: Value, item: string, role?: string): boolean {
  const want = role ? `${item} · ${role}` : item;
  return valuesOf(holds).some((h) => {
    const label = String(norm(h));
    const w = String(norm(want));
    return role ? label === w : label === w || label.startsWith(`${w} · `);
  });
}

function test(
  c: Condition,
  row: Row,
  dataset: DatasetKey,
  timeZone: string,
): boolean {
  if (c.op === "holds") {
    const hits = c.items.map((i) => holdsItem(row.holds, i.item, i.role));
    if (c.mode === "all") return hits.every(Boolean);
    if (c.mode === "any") return hits.some(Boolean);
    return !hits.some(Boolean);
  }
  const type = fieldOf(dataset, c.field)?.type ?? "text";
  const v = row[c.field] ?? null;
  const values = valuesOf(v).map(norm);
  const empty = values.length === 0 || values.every((x) => x === "");
  switch (c.op) {
    case "eq":
      return values.includes(norm(c.value));
    case "ne":
      return !values.includes(norm(c.value));
    case "in":
      return c.values.some((x) => values.includes(norm(x)));
    case "not_in":
      return !c.values.some((x) => values.includes(norm(x)));
    case "contains":
      return values.some((x) => String(x).includes(String(norm(c.value))));
    case "not_contains":
      return !values.some((x) => String(x).includes(String(norm(c.value))));
    case "empty":
      return empty;
    case "not_empty":
      return !empty;
  }
  if (c.op === "gt" || c.op === "gte" || c.op === "lt" || c.op === "lte") {
    if (typeof v !== "number") return false;
    const n = type === "duration" ? c.value * 3600 : c.value;
    return c.op === "gt"
      ? v > n
      : c.op === "gte"
        ? v >= n
        : c.op === "lt"
          ? v < n
          : v <= n;
  }
  // Date conditions: a missing date never matches.
  const d = dayOf(v, type, timeZone);
  if (!d) return false;
  const [y, m, dd] = d.split("-").map(Number);
  switch (c.op) {
    case "from":
      return d >= c.date;
    case "until":
      return d <= c.date;
    case "between":
      return d >= c.from && d <= c.to;
    case "day_of_month":
      return c.days === "even"
        ? dd % 2 === 0
        : c.days === "odd"
          ? dd % 2 === 1
          : c.days.includes(dd);
    case "weekday":
      // A calendar day's weekday doesn't depend on the zone: use UTC.
      return c.days.includes(new Date(Date.UTC(y, m - 1, dd)).getUTCDay() || 7);
    case "month":
      return c.months.includes(m);
    case "year":
      return c.years.includes(y);
  }
}

/** Does a row pass the where tree? */
export function matches(
  w: Where,
  row: Row,
  dataset: DatasetKey,
  timeZone: string,
): boolean {
  if ("all" in w) return w.all.every((x) => matches(x, row, dataset, timeZone));
  if ("any" in w) return w.any.some((x) => matches(x, row, dataset, timeZone));
  if ("not" in w) return !matches(w.not, row, dataset, timeZone);
  return test(w, row, dataset, timeZone);
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** The group value of a row: a date by day / month / year / weekday. */
function bucket(
  v: Value,
  type: FieldType,
  by: "day" | "month" | "year" | "weekday" | undefined,
  timeZone: string,
): string | null {
  if (!by)
    return Array.isArray(v) ? v.join(", ") : v === null ? null : String(v);
  const d = dayOf(v, type, timeZone);
  if (!d) return null;
  if (by === "day") return d;
  if (by === "month") return d.slice(0, 7);
  if (by === "year") return d.slice(0, 4);
  const [y, m, dd] = d.split("-").map(Number);
  return WEEKDAYS[(new Date(Date.UTC(y, m - 1, dd)).getUTCDay() + 6) % 7];
}

/** "AE" → "United Arab Emirates"; a list or a grouped "BD, GB" → each name. */
export function countryText(v: Value): string | null {
  if (v === null || v === undefined) return null;
  const codes = Array.isArray(v) ? v : String(v).split(", ");
  const names = codes.filter(Boolean).map((c) => countryName(c.toUpperCase()));
  return names.length ? names.join(", ") : null;
}

function compare(a: Value, b: Value): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1; // empty last
  if (b === null || b === undefined) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "en", { numeric: true });
}

const MEASURE_LABEL = {
  avg: "Average",
  min: "Earliest / lowest",
  max: "Latest / highest",
  sum: "Total",
};

/** One part → its columns and rows (filtered, grouped, sorted, limited). */
export function runPart(part: Part, rows: Row[], timeZone: string): PartResult {
  const ds = part.dataset;
  const label = (key: string) => fieldOf(ds, key)?.label ?? key;
  const typeOf = (key: string) => fieldOf(ds, key)?.type ?? "text";
  const isCountry = (key: string) => fieldOf(ds, key)?.country === true;
  const kept = part.where
    ? rows.filter((r) => matches(part.where as Where, r, ds, timeZone))
    : rows;

  let columns: Column[];
  let out: Row[];
  if (part.groupBy.length === 0) {
    columns = part.columns.map((k) => ({
      key: k,
      label: label(k),
      type: typeOf(k),
      ...(isCountry(k) && { country: true }),
    }));
    out = kept.map((r) =>
      Object.fromEntries(part.columns.map((k) => [k, r[k] ?? null])),
    );
  } else {
    const measures = part.measures.length
      ? part.measures
      : [{ fn: "count" as const }];
    const groups = new Map<string, { keys: Row; rows: Row[] }>();
    for (const r of kept) {
      const keys: Row = {};
      for (const g of part.groupBy)
        keys[g.field] = bucket(
          r[g.field] ?? null,
          typeOf(g.field),
          g.by,
          timeZone,
        );
      const id = JSON.stringify(keys);
      const group = groups.get(id) ?? { keys, rows: [] };
      group.rows.push(r);
      groups.set(id, group);
    }
    columns = [
      ...part.groupBy.map((g) => ({
        key: g.field,
        label: g.by ? `${label(g.field)} (${g.by})` : label(g.field),
        type: (g.by ? "text" : typeOf(g.field)) as FieldType,
        ...(!g.by && isCountry(g.field) && { country: true }),
      })),
      ...measures.map((m) =>
        m.fn === "count"
          ? { key: "count", label: "Count", type: "number" as FieldType }
          : {
              key: measureKey(m),
              label: `${MEASURE_LABEL[m.fn]} ${label(m.field).toLowerCase()}`,
              type: typeOf(m.field),
            },
      ),
    ];
    out = [...groups.values()].map(({ keys, rows: rs }) => {
      const row: Row = { ...keys };
      for (const m of measures) {
        if (m.fn === "count") {
          row.count = rs.length;
          continue;
        }
        const t = typeOf(m.field);
        const vals = rs
          .map((r) => r[m.field])
          .filter((v) => v !== null && v !== undefined && v !== "");
        if (vals.length === 0) {
          row[measureKey(m)] = null;
        } else if (m.fn === "min" || m.fn === "max") {
          const sorted = [...vals].sort(compare);
          row[measureKey(m)] = (
            m.fn === "min" ? sorted[0] : sorted[sorted.length - 1]
          ) as Value;
        } else {
          const nums = vals.filter((v): v is number => typeof v === "number");
          const sum = nums.reduce((a, b) => a + b, 0);
          row[measureKey(m)] =
            nums.length === 0
              ? null
              : m.fn === "sum"
                ? sum
                : t === "duration"
                  ? Math.round(sum / nums.length)
                  : Math.round((sum / nums.length) * 100) / 100;
        }
      }
      return row;
    });
  }

  const sort = part.sort.length
    ? part.sort
    : part.groupBy.length
      ? part.groupBy.map((g) => ({ by: g.field, dir: "asc" as const }))
      : [];
  if (sort.length)
    out.sort((a, b) => {
      for (const s of sort) {
        const av = a[s.by] ?? null;
        const bv = b[s.by] ?? null;
        // Empty values last, whichever the direction.
        if ((av === null) !== (bv === null)) return av === null ? 1 : -1;
        const d = isCountry(s.by)
          ? compare(countryText(av), countryText(bv))
          : compare(av, bv);
        if (d !== 0) return s.dir === "asc" ? d : -d;
      }
      return 0;
    });

  const limit = part.limit ?? LIMITS.defaultRows;
  return {
    columns,
    rows: out.slice(0, limit),
    total: out.length,
    truncated: out.length > limit,
  };
}

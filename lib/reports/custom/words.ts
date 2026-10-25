import { formatDuration } from "@/lib/reports/signatures";
import { formatDate, formatDayTime } from "@/lib/requests/format";
import { countryName } from "@/lib/requests/labels";
import { DATASETS, fieldOf, type Field, type Row } from "./datasets";
import { countryText, type Column } from "./engine";
import type { Condition, Part, Where } from "./definition";

/**
 * Custom reports in plain words (F17a): cell values as people read them,
 * and "How this report is built" — every part's data set, conditions,
 * grouping and order, so a reader can check the robot understood them.
 */

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

/** "2026-10" → "Oct 2026" (a month group). */
const monthLabel = (v: string) => {
  const [y, m] = v.split("-");
  return `${MONTHS[Number(m) - 1] ?? m} ${y}`;
};

/** "2026-10-06" → "6 Oct 2026". */
const dayLabel = (d: string) => formatDate(d);

/** One cell as text ("—" when empty). */
export function formatCell(
  value: Row[string] | undefined,
  column: Column,
  timeZone: string,
): string {
  if (value === null || value === undefined || value === "") return "—";
  if (column.country && (Array.isArray(value) || typeof value === "string"))
    return countryText(value) ?? "—";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (column.type === "duration" && typeof value === "number")
    return formatDuration(value);
  if (typeof value === "number") return value.toLocaleString("en-GB");
  if (/^\d{4}-\d{2}$/.test(value)) return monthLabel(value);
  if (column.type === "date") return dayLabel(value);
  if (column.type === "datetime") return formatDayTime(value, timeZone);
  return value;
}

const quote = (v: unknown) => (typeof v === "string" ? `"${v}"` : String(v));
const orList = (vs: unknown[]) =>
  vs.length === 1
    ? quote(vs[0])
    : `${vs.slice(0, -1).map(quote).join(", ")} or ${quote(vs.at(-1))}`;
const andList = (vs: string[]) =>
  vs.length === 1 ? vs[0] : `${vs.slice(0, -1).join(", ")} and ${vs.at(-1)}`;

function conditionWords(c: Condition, field: Field | undefined): string {
  if (c.op === "holds") {
    const items = c.items.map((i) =>
      i.role ? `${i.item} (${i.role})` : i.item,
    );
    if (c.mode === "all") return `holds ${andList(items)}`;
    if (c.mode === "any")
      return items.length > 1
        ? `holds at least one of ${items.join(", ")}`
        : `holds ${items[0]}`;
    return items.length > 1
      ? `holds none of ${items.join(", ")}`
      : `doesn't hold ${items[0]}`;
  }
  const name = (field?.label ?? c.field).toLowerCase();
  // Country codes read as names: "work country is "United Arab Emirates"".
  const shown = (v: unknown) =>
    field?.country && typeof v === "string" ? countryName(v.toUpperCase()) : v;
  switch (c.op) {
    case "eq":
      return `${name} is ${quote(shown(c.value))}`;
    case "ne":
      return `${name} is not ${quote(shown(c.value))}`;
    case "in":
      return `${name} is ${orList(c.values.map(shown))}`;
    case "not_in":
      return `${name} is not ${orList(c.values.map(shown))}`;
    case "contains":
      return `${name} contains ${quote(c.value)}`;
    case "not_contains":
      return `${name} doesn't contain ${quote(c.value)}`;
    case "empty":
      return `${name} is empty`;
    case "not_empty":
      return `${name} is filled in`;
    case "from":
      return `${name} on or after ${dayLabel(c.date)}`;
    case "until":
      return `${name} on or before ${dayLabel(c.date)}`;
    case "between":
      return `${name} ${dayLabel(c.from)} – ${dayLabel(c.to)}`;
    case "day_of_month":
      return `${name} on ${
        c.days === "even"
          ? "an even day of the month"
          : c.days === "odd"
            ? "an odd day of the month"
            : `day ${andList(c.days.map(String))} of the month`
      }`;
    case "weekday":
      return `${name} on a ${orList(c.days.map((d) => WEEKDAYS[d - 1])).replaceAll('"', "")}`;
    case "month":
      return `${name} in ${orList(c.months.map((m) => MONTHS[m - 1])).replaceAll('"', "")}`;
    case "year":
      return `${name} in ${orList(c.years).replaceAll('"', "")}`;
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      const unit = field?.type === "duration" ? " hours" : "";
      const word = {
        gt: "more than",
        gte: "at least",
        lt: "less than",
        lte: "at most",
      }[c.op];
      return `${name} ${word} ${c.value}${unit}`;
    }
  }
}

/** A where tree in words: "a · b · (c or d) · not (e)". */
export function whereWords(w: Where, part: Part): string {
  if ("all" in w) return w.all.map((x) => whereWords(x, part)).join(" · ");
  if ("any" in w)
    return `(${w.any.map((x) => whereWords(x, part)).join(" or ")})`;
  if ("not" in w) return `not (${whereWords(w.not, part)})`;
  return conditionWords(
    w,
    "field" in w ? fieldOf(part.dataset, w.field) : undefined,
  );
}

/** One part, in one line: data set · conditions · grouping · order. */
export function partWords(part: Part): string {
  const ds = DATASETS[part.dataset];
  const label = (k: string) =>
    (fieldOf(part.dataset, k)?.label ?? k).toLowerCase();
  const bits = [`From ${ds.label}`];
  bits.push(part.where ? whereWords(part.where, part) : "everyone in it");
  if (part.groupBy.length) {
    bits.push(
      `grouped by ${andList(part.groupBy.map((g) => (g.by ? `${label(g.field)} (${g.by})` : label(g.field))))}`,
    );
    const measures = part.measures.length
      ? part.measures
      : [{ fn: "count" as const }];
    bits.push(
      `shows ${andList(
        measures.map((m) =>
          m.fn === "count"
            ? "how many"
            : `the ${{ avg: "average", min: "lowest / earliest", max: "highest / latest", sum: "total" }[m.fn]} ${label(m.field)}`,
        ),
      )}`,
    );
  } else {
    bits.push(`columns ${andList(part.columns.map(label))}`);
  }
  if (part.sort.length)
    bits.push(
      `sorted by ${andList(part.sort.map((s) => `${label(s.by).replace(/_/g, " ")} (${s.dir === "asc" ? "A to Z / lowest first" : "Z to A / highest first"})`))}`,
    );
  return bits.join(" · ");
}

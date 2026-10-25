import * as z from "zod";
import {
  DATASETS,
  DATASET_KEYS,
  fieldOf,
  type DatasetKey,
  type FieldType,
} from "./datasets";

/**
 * The report language (F17a, PROJECT_PLAN §6.6): what the robot writes to
 * build a custom report. Zod checks the shape; `checkDefinition` checks it
 * against the data set catalogue (every field exists, every condition fits
 * its field). Nothing here is SQL — `engine.ts` applies it to rows the
 * reader was allowed to read.
 */

export const LIMITS = {
  parts: 5,
  columns: 15,
  groupBy: 2,
  measures: 4,
  sort: 3,
  values: 50,
  conditions: 40,
  depth: 5,
  rows: 2000,
  defaultRows: 500,
} as const;

const day = z.iso.date(); // "2026-10-25", a company-time calendar day
const fieldKey = z.string().regex(/^[a-z_]{1,40}$/);
const scalar = z.union([z.string().max(200), z.number(), z.boolean()]);

/** One test on one field. Dates are company-time days, inclusive. */
const condition = z.discriminatedUnion("op", [
  z.object({ op: z.enum(["eq", "ne"]), field: fieldKey, value: scalar }),
  z.object({
    op: z.enum(["in", "not_in"]),
    field: fieldKey,
    values: z.array(scalar).min(1).max(LIMITS.values),
  }),
  z.object({
    op: z.enum(["contains", "not_contains"]),
    field: fieldKey,
    value: z.string().min(1).max(200),
  }),
  z.object({ op: z.enum(["empty", "not_empty"]), field: fieldKey }),
  z.object({ op: z.enum(["from", "until"]), field: fieldKey, date: day }),
  z.object({ op: z.literal("between"), field: fieldKey, from: day, to: day }),
  z.object({
    op: z.literal("day_of_month"),
    field: fieldKey,
    days: z.union([
      z.enum(["even", "odd"]),
      z.array(z.int().min(1).max(31)).min(1).max(31),
    ]),
  }),
  z.object({
    op: z.literal("weekday"),
    field: fieldKey,
    // 1 = Monday … 7 = Sunday
    days: z.array(z.int().min(1).max(7)).min(1).max(7),
  }),
  z.object({
    op: z.literal("month"),
    field: fieldKey,
    months: z.array(z.int().min(1).max(12)).min(1).max(12),
  }),
  z.object({
    op: z.literal("year"),
    field: fieldKey,
    years: z.array(z.int().min(2000).max(2100)).min(1).max(20),
  }),
  z.object({
    // Numbers; for a duration the value is in hours.
    op: z.enum(["gt", "gte", "lt", "lte"]),
    field: fieldKey,
    value: z.number(),
  }),
  z.object({
    // People today only: what they hold (item name, optionally the role).
    op: z.literal("holds"),
    mode: z.enum(["all", "any", "none"]),
    items: z
      .array(
        z.object({
          item: z.string().min(1).max(80),
          role: z.string().min(1).max(80).optional(),
        }),
      )
      .min(1)
      .max(LIMITS.values),
  }),
]);
export type Condition = z.infer<typeof condition>;

/** Conditions combined: all of, any of, not. */
export type Where =
  Condition | { all: Where[] } | { any: Where[] } | { not: Where };
const where: z.ZodType<Where> = z.lazy(() =>
  z.union([
    condition,
    z.object({ all: z.array(where).min(1).max(LIMITS.conditions) }),
    z.object({ any: z.array(where).min(1).max(LIMITS.conditions) }),
    z.object({ not: where }),
  ]),
);

const measure = z.discriminatedUnion("fn", [
  z.object({ fn: z.literal("count") }),
  z.object({ fn: z.enum(["avg", "min", "max", "sum"]), field: fieldKey }),
]);
export type Measure = z.infer<typeof measure>;

const part = z.object({
  title: z.string().trim().min(1).max(120),
  dataset: z.enum(DATASET_KEYS as [DatasetKey, ...DatasetKey[]]),
  where: where.optional(),
  /** The fields shown (ungrouped parts). */
  columns: z.array(fieldKey).max(LIMITS.columns).default([]),
  /** Group rows (a date field can be grouped by day, month, year or weekday). */
  groupBy: z
    .array(
      z.object({
        field: fieldKey,
        by: z.enum(["day", "month", "year", "weekday"]).optional(),
      }),
    )
    .max(LIMITS.groupBy)
    .default([]),
  /** What each group shows (grouped parts; default: count). */
  measures: z.array(measure).max(LIMITS.measures).default([]),
  sort: z
    .array(z.object({ by: fieldKey, dir: z.enum(["asc", "desc"]) }))
    .max(LIMITS.sort)
    .default([]),
  limit: z.int().min(1).max(LIMITS.rows).optional(),
  /** A bar chart of the first measure (grouped parts). */
  chart: z.boolean().default(false),
});
export type Part = z.infer<typeof part>;

export const definitionSchema = z.object({
  title: z.string().trim().min(1).max(200),
  parts: z.array(part).min(1).max(LIMITS.parts),
});
export type Definition = z.infer<typeof definitionSchema>;

/** "avg_time_to_approve", "count": the column key of a measure. */
export function measureKey(m: Measure): string {
  return m.fn === "count" ? "count" : `${m.fn}_${m.field}`;
}

const DATE_TYPES: FieldType[] = ["date", "datetime"];
/** Which field types each condition fits. */
const FITS: Record<Exclude<Condition["op"], "holds">, FieldType[]> = {
  eq: ["text", "list", "number", "boolean", "date"],
  ne: ["text", "list", "number", "boolean", "date"],
  in: ["text", "list", "number"],
  not_in: ["text", "list", "number"],
  contains: ["text", "list"],
  not_contains: ["text", "list"],
  empty: ["text", "list", "date", "datetime", "number", "duration", "boolean"],
  not_empty: [
    "text",
    "list",
    "date",
    "datetime",
    "number",
    "duration",
    "boolean",
  ],
  from: DATE_TYPES,
  until: DATE_TYPES,
  between: DATE_TYPES,
  day_of_month: DATE_TYPES,
  weekday: DATE_TYPES,
  month: DATE_TYPES,
  year: DATE_TYPES,
  gt: ["number", "duration"],
  gte: ["number", "duration"],
  lt: ["number", "duration"],
  lte: ["number", "duration"],
};

/** Every condition in a where tree, with its depth. */
function conditions(w: Where, depth = 1): { c: Condition; depth: number }[] {
  if ("all" in w) return w.all.flatMap((x) => conditions(x, depth + 1));
  if ("any" in w) return w.any.flatMap((x) => conditions(x, depth + 1));
  if ("not" in w) return conditions(w.not, depth + 1);
  return [{ c: w, depth }];
}

/**
 * Checks a definition against the catalogue. Returns the problems in plain
 * words (for the robot to fix), or none. Run after `definitionSchema`.
 */
export function checkDefinition(def: Definition): string[] {
  const problems: string[] = [];
  def.parts.forEach((p, i) => {
    const where = `Part ${i + 1} (${DATASETS[p.dataset].label})`;
    const field = (key: string) => {
      const f = fieldOf(p.dataset, key);
      if (!f) problems.push(`${where}: there is no field "${key}".`);
      return f;
    };
    if (p.where) {
      const all = conditions(p.where);
      if (all.length > LIMITS.conditions)
        problems.push(`${where}: more than ${LIMITS.conditions} conditions.`);
      if (all.some((x) => x.depth > LIMITS.depth))
        problems.push(`${where}: conditions nested too deep.`);
      for (const { c } of all) {
        if (c.op === "holds") {
          if (!DATASETS[p.dataset].holdings)
            problems.push(
              `${where}: "holds" works on People today only — build that part from People today.`,
            );
          continue;
        }
        const f = field(c.field);
        if (f && !FITS[c.op].includes(f.type))
          problems.push(
            `${where}: "${c.op}" doesn't fit "${c.field}" (${f.type}).`,
          );
      }
    }
    const grouped = p.groupBy.length > 0;
    for (const g of p.groupBy) {
      const f = field(g.field);
      if (f && g.by && !DATE_TYPES.includes(f.type))
        problems.push(
          `${where}: only a date can be grouped by ${g.by} ("${g.field}" is ${f.type}).`,
        );
    }
    for (const m of p.measures) {
      if (m.fn === "count") continue;
      const f = field(m.field);
      const fits =
        m.fn === "min" || m.fn === "max"
          ? ["number", "duration", ...DATE_TYPES]
          : ["number", "duration"];
      if (f && !fits.includes(f.type))
        problems.push(
          `${where}: can't take the ${m.fn} of "${m.field}" (${f.type}).`,
        );
    }
    if (!grouped && p.measures.length > 0)
      problems.push(`${where}: totals and averages need a "group by".`);
    if (!grouped && p.columns.length === 0)
      problems.push(`${where}: choose at least one column.`);
    p.columns.forEach(field);
    const sortable = grouped
      ? new Set([
          ...p.groupBy.map((g) => g.field),
          ...(p.measures.length ? p.measures : [{ fn: "count" as const }]).map(
            measureKey,
          ),
        ])
      : new Set(p.columns);
    for (const s of p.sort)
      if (!sortable.has(s.by))
        problems.push(`${where}: can't sort by "${s.by}" — it isn't shown.`);
  });
  return problems;
}

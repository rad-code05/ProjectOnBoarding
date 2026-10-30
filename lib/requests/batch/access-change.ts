import {
  addedSuggestions,
  heldSuggestions,
  type AccessChangeInput,
  type HeldChangeInput,
} from "@/lib/ai/tools/access-change-shared";
import { leaverMatches } from "@/lib/ai/tools/offboarding-shared";
import type { FormOptions } from "@/lib/ai/tools/onboarding-shared";
import { normalize } from "@/lib/ai/tools/people-shared";
import type { HeldItem } from "@/lib/requests/access-change";
import { blockedReason, type Leaver } from "@/lib/requests/leavers-shared";
import {
  fixApps,
  listItems,
  readDay,
  splitItem,
  type BatchWrite,
  type Problem,
} from "./onboarding";

/**
 * Batch of access changes (F17b-5c, pure): one row of the list — the person,
 * the effective date and three list cells: **Change** ("Slack (Workspace
 * Admin)"), **Remove** ("Figma, LT-1008") and **Add** ("Notion (Member),
 * Laptop · macOS"). Each person is found among those who hold something
 * today, and every change is checked against what they hold, by the robot's
 * own rules (`heldSuggestions` / `addedSuggestions`). Nothing is guessed.
 */

export type AccessChangeContext = {
  /** Everyone who holds something today (`listLeavers`). */
  leavers: Leaver[];
  /** What each person found holds (by employee id). */
  held: Map<string, HeldItem[]>;
  options: FormOptions;
  /** Today in the company timezone, YYYY-MM-DD. */
  today: string;
};

export type CheckedChange = {
  writes: BatchWrite[];
  problems: Problem[];
  employeeId: string | null;
};

/** The person in a row, or why not (shared with the store, which loads what they hold). */
export function findChanger(
  leavers: Leaver[],
  person: string,
): { leaver: Leaver } | { problem: string } {
  const said = person.trim();
  if (!said) return { problem: "Name or work email missing — required" };
  const matches = leaverMatches(leavers, said);
  if (matches.length === 0)
    return {
      problem: `Nobody called "${said}" holds anything in the app — an access change starts from what the person holds`,
    };
  if (matches.length > 1)
    return {
      problem: `${matches.length} people match — write the work email: ${matches
        .slice(0, 5)
        .map((l) => `${l.name} (${l.email})`)
        .join(", ")}`,
    };
  const blocked = blockedReason(matches[0], "access_modification");
  return blocked ? { problem: blocked } : { leaver: matches[0] };
}

const same = (a: string, b: string) => normalize(a) === normalize(b);

/**
 * The Add cell → what the robot's checks read: each item is an application,
 * an equipment type or an access type of the catalog (in that order).
 */
export function readAdd(
  cell: string | undefined,
  options: FormOptions,
): { add: NonNullable<AccessChangeInput["add"]>; unknown: string[] } {
  const add = {
    applications: [] as { name: string; permission?: string }[],
    equipment: [] as { type: string; description?: string }[],
    access: [] as { type: string; scope?: string }[],
  };
  const unknown: string[] = [];
  for (const item of listItems(cell)) {
    const s = splitItem(item);
    if (options.apps.some((a) => same(a.name, item) || same(a.name, s.name)))
      add.applications.push({ name: s.name, permission: s.detail });
    else if (options.equipment.some((t) => same(t.name, item)))
      add.equipment.push({ type: item });
    else if (options.equipment.some((t) => same(t.name, s.name)))
      add.equipment.push({ type: s.name, description: s.detail });
    else if (options.access.some((t) => same(t.name, s.name)))
      add.access.push({ type: s.name, scope: s.detail });
    else unknown.push(item);
  }
  // A bracket in the app's own name, several roles of a multi-role app.
  const apps = fixApps({ applications: add.applications }, options);
  return { add: { ...add, applications: apps.applications ?? [] }, unknown };
}

/** One row on its own (the same person twice is `checkAccessChangeBatch`). */
export function checkAccessChangeRow(
  values: Record<string, string>,
  ctx: AccessChangeContext,
): CheckedChange {
  const problems: Problem[] = [];
  const writes: BatchWrite[] = [];
  const add = (field: string, message: string) =>
    problems.push({ field, message });

  const found = findChanger(ctx.leavers, values.person ?? "");
  const leaver = "leaver" in found ? found.leaver : null;
  if (!leaver) add("person", (found as { problem: string }).problem);

  const cell = values.effectiveDate?.trim();
  if (!cell) add("effectiveDate", "Effective date missing — required");
  else {
    const day = readDay(cell);
    if (!day)
      add(
        "effectiveDate",
        `"${cell}" isn't a date — write it like 2026-11-02 or 02/11/2026`,
      );
    else if (day < ctx.today)
      add("effectiveDate", "In the past — dates are never backdated");
    else writes.push({ kind: "field", target: "effective_date", value: day });
  }

  const changes: HeldChangeInput[] = listItems(values.change).map((item) => {
    const s = splitItem(item);
    // Several roles of a multi-role app: "Google Cloud (Viewer, Editor)".
    const to = s.detail?.replace(/\s*,\s*/g, "; ");
    return { item: s.name, action: "change", to };
  });
  const removals: HeldChangeInput[] = listItems(values.remove).map((item) => ({
    item,
    action: "remove",
  }));
  const { add: added, unknown } = readAdd(values.add, ctx.options);
  for (const item of unknown)
    add(
      "add",
      `"${item}" isn't an application, equipment or access type in the catalog`,
    );

  if (
    !changes.length &&
    !removals.length &&
    !added.applications?.length &&
    !added.equipment?.length &&
    !added.access?.length &&
    !unknown.length
  )
    add("change", "Nothing changes — fill in Change, Remove or Add");

  // What they hold is only known once the person is.
  if (leaver) {
    const held = ctx.held.get(leaver.id) ?? [];
    const changed = heldSuggestions(changes, held);
    const removed = heldSuggestions(removals, held);
    for (const m of changed.problems) add("change", m);
    for (const m of removed.problems) add("remove", m);
    const both = changed.suggestions.filter((c) =>
      removed.suggestions.some((r) => r.target === c.target),
    );
    for (const c of both) {
      const name =
        held.find((h) => `held:${h.inventoryId}` === c.target)?.name ?? "It";
      add("remove", `${name} is both changed and removed — pick one`);
    }
    const added2 = addedSuggestions(added, held, ctx.options);
    for (const m of added2.problems) add("add", m);
    writes.push(
      ...changed.suggestions,
      ...removed.suggestions,
      ...added2.suggestions,
    );
  }
  return { writes, problems, employeeId: leaver?.id ?? null };
}

/** Every row, plus the same person twice in the list (the later rows flagged). */
export function checkAccessChangeBatch(
  rows: { position: number; values: Record<string, string> }[],
  ctx: AccessChangeContext,
): Map<number, CheckedChange> {
  const out = new Map<number, CheckedChange>();
  const seen = new Map<string, number>();
  for (const row of [...rows].sort((a, b) => a.position - b.position)) {
    const checked = checkAccessChangeRow(row.values, ctx);
    if (checked.employeeId) {
      const first = seen.get(checked.employeeId);
      if (first !== undefined)
        checked.problems.push({
          field: "person",
          message: `The same person as row ${first}`,
        });
      else seen.set(checked.employeeId, row.position);
    }
    out.set(row.position, checked);
  }
  return out;
}

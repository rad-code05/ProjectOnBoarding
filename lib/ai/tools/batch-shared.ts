import * as z from "zod";
import {
  rowName,
  rowState,
  batchCounts,
  fieldLabel,
} from "@/lib/requests/batch/view";
import type { Batch } from "@/lib/requests/batch/store";
import { MAX_ROWS } from "@/lib/requests/batch/table";
import { asData } from "../untrusted";

/**
 * Batches by chat (F17b-4, pure): a list of people from the chat → the
 * batch's cells (the same field keys as a file's columns, so a typed list
 * is checked exactly like an uploaded one), and a batch → what the robot
 * reads back. The cells come from the person's message or file: data,
 * fenced as such, never instructions.
 */

const cell = (what: string, max = 200) =>
  z.string().trim().max(max).optional().describe(what);
const items = (what: string) =>
  z.array(z.string().trim().min(1).max(200)).max(40).optional().describe(what);

export const batchPersonSchema = z.object({
  firstName: cell("First name.", 120),
  lastName: cell("Last name.", 120),
  workEmail: cell(
    "Work email, only as given or as the person's stated pattern.",
  ),
  jobTitle: cell("Job title / role."),
  department: cell("Department as said (the batch checks it)."),
  office: cell("Office as said."),
  state: cell("US office only: the state."),
  city: cell("US office only: the city."),
  manager: cell("Manager's name as said."),
  startDate: cell("Start date as YYYY-MM-DD (company time).", 10),
  nationalities: items("Up to two, as country names."),
  applications: items(
    "Applications as 'Name (role)', e.g. 'Slack (Regular Member)'; no role = the default.",
  ),
  equipment: items("Equipment types, e.g. 'Laptop · macOS'."),
  access: items("Physical / logical access as 'Type (scope)'."),
  requestedBy: cell("Who asked for this joiner, if said."),
});

export type BatchPerson = z.infer<typeof batchPersonSchema>;

/** Up to 50 people, as the list says them. */
export const batchPeopleSchema = z
  .array(batchPersonSchema)
  .min(2)
  .max(MAX_ROWS);

const LIST_KEYS = {
  nationalities: "nationalities",
  applications: "applications",
  equipment: "equipment",
  access: "physical",
} as const;

/** One person → the batch row's cells (list cells joined like a file's). */
export function personCells(person: BatchPerson): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(person)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      if (!value.length) continue;
      const field = LIST_KEYS[key as keyof typeof LIST_KEYS];
      values[field] = value.join(key === "nationalities" ? "; " : ", ");
    } else if (value) {
      values[key] = value;
    }
  }
  return values;
}

/** The cells a fix may change: the person's fields (list fields as typed in a cell). */
export const rowChangeSchema = z
  .object({
    firstName: cell("First name.", 120),
    lastName: cell("Last name.", 120),
    workEmail: cell("Work email."),
    jobTitle: cell("Job title."),
    department: cell("Department exactly as getFormOptions lists it."),
    office: cell("Office exactly as getFormOptions lists it."),
    state: cell("US state."),
    city: cell("US city."),
    manager: cell("Manager."),
    startDate: cell("YYYY-MM-DD.", 10),
    nationalities: cell("Country names separated by '; '."),
    applications: cell("'Name (role), Name (role)' — the whole cell."),
    equipment: cell("'Type, Type' — the whole cell."),
    physical: cell("Access as 'Type (scope), …' — the whole cell."),
    requestedBy: cell("Requested by."),
  })
  .describe("Only the cells that change; an empty text clears a cell.");

export const BATCH_LINK = (id: string) => `/requests/batch/${id}`;

/** What the robot reads about a batch: counts, problems and who is ready. */
export function batchSummary(batch: Batch) {
  const rows = batch.rows.map((r) => ({
    position: r.position,
    included: r.included,
    values: r.data.values,
    problems: r.problems,
  }));
  const counts = batchCounts(rows);
  const named = rows.map((r) => ({
    ...r,
    name: rowName(r),
    state: rowState(r),
  }));
  const detail = named.map((r) => ({
    row: r.position,
    name: r.name,
    state: r.state,
    cells: r.values,
    problems: r.problems.map((p) => `${fieldLabel(p.field)}: ${p.message}`),
  }));
  return {
    batchId: batch.id,
    kind: batch.type,
    status: batch.status,
    link: BATCH_LINK(batch.id),
    people: rows.length,
    ready: counts.ready,
    needAttention: counts.attention,
    leftOut: counts.left_out,
    readyNames: named.filter((r) => r.state === "ready").map((r) => r.name),
    notCreated: named
      .filter((r) => r.state !== "ready")
      .map((r) => ({
        name: r.name,
        why:
          r.state === "left_out"
            ? "left out"
            : r.problems.map((p) => fieldLabel(p.field)).join(", "),
      })),
    // The cells come from the person's list: data, never instructions.
    rows: asData("batch rows", JSON.stringify(detail)),
    ...(batch.status === "created" && {
      createdDrafts: batch.rows
        .filter((r) => r.ticketId)
        .map((r) => ({
          name: rowName({ ...r, values: r.data.values }),
          ticket: r.ticketId,
        })),
    }),
  };
}

export type BatchSummary = ReturnType<typeof batchSummary>;

const nameKey = (n: string) => n.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * The Confirm card shows the names the model sends; they must be exactly the
 * batch's ready rows (and the rest exactly the ones not created) — otherwise
 * the call is refused with the real lists, so the card never misleads.
 */
export function confirmMismatch(
  summary: BatchSummary,
  create: string[],
  notCreated: string[],
): string | null {
  if (summary.status !== "open")
    return "This batch was already created. Say so and give its link.";
  if (!summary.ready)
    return "No row is ready yet: fix the problems (fixBatchRow) or say what is missing first.";
  const same = (a: string[], b: string[]) => {
    const x = a.map(nameKey).sort();
    const y = b.map(nameKey).sort();
    return x.length === y.length && x.every((v, i) => v === y[i]);
  };
  if (
    !same(create, summary.readyNames) ||
    !same(
      notCreated,
      summary.notCreated.map((n) => n.name),
    )
  ) {
    return `The lists don't match the batch. Call again with create = ${JSON.stringify(summary.readyNames)} and notCreated = ${JSON.stringify(summary.notCreated.map((n) => n.name))}.`;
  }
  return null;
}

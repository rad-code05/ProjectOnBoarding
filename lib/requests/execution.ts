import * as z from "zod";
import type { RequestState } from "./labels";

/** One section 9 checklist item that applies to the request's type. */
export type ChecklistItem = { key: string; label: string };

/** Section 9 as stored: answers, notes, who executed it. */
export type ExecutionRecord = {
  checks: Record<string, boolean>;
  notes: string | null;
  executedBy: string | null;
};

/** Where the request is in the workflow, for the banner and the buttons. */
export type WorkflowInfo = {
  executionStartedLabel: string | null;
  cancelledLabel: string | null;
  cancelReason: string | null;
  returnReason: string | null;
};

/** Section 9 can be filled in while the request is being executed. */
export const EXECUTION_EDITABLE: RequestState[] = ["in_execution", "returned"];

export const saveExecutionSchema = z.object({
  requestId: z.uuid(),
  checks: z.record(z.string().regex(/^[a-z][a-z0-9_]*$/), z.boolean()),
  notes: z
    .string()
    .trim()
    .max(2000, "Keep notes under 2000 characters.")
    .nullable()
    .transform((value) => value || null),
});

export const changeStateSchema = z.object({
  requestId: z.uuid(),
  to: z.enum(["in_execution", "cancelled"]),
  reason: z
    .string()
    .trim()
    .max(500, "Keep the reason under 500 characters.")
    .nullable()
    .transform((value) => value || null),
});

/** How many of the items are ticked. */
export function doneCount(
  items: ChecklistItem[],
  checks: Record<string, boolean>,
) {
  return items.filter((item) => checks[item.key]).length;
}

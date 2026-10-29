import { tool } from "ai";
import * as z from "zod";
import { loadBatch, saveBatchRow } from "@/lib/requests/batch/store";
import { batchSummary, rowChangeSchema } from "./batch-shared";
import { defineTool } from "./types";

/**
 * Fixes a row of the person's own open batch (F17b-4): the cells they told
 * the robot to change, or leaves the row out / takes it back in; the batch
 * is checked again. Like typing in *Fix this row* — own batch only, nothing
 * created, so no Confirm. Admin / requester.
 */
export const fixBatchRow = defineTool({
  name: "fixBatchRow",
  roles: ["admin", "requester"],
  kind: "own",
  needsApproval: false,
  build: (ctx) =>
    tool({
      description:
        "Change a row of an open batch as the person tells you ('Yes, Engineering', 'leave Sara out'): only the cells that change, or included false / true. The whole batch is checked again; report what is still wrong. Never change a row the person didn't ask about.",
      inputSchema: z.object({
        batchId: z.uuid(),
        row: z.number().int().min(1).max(50).describe("The row number."),
        cells: rowChangeSchema.optional(),
        included: z.boolean().optional(),
      }),
      execute: async ({ batchId, row, cells, included }) => {
        const batch = await loadBatch(ctx.db, batchId);
        if (!batch) return { error: "No such batch among yours." };
        if (batch.status !== "open")
          return { error: "This batch was already created; it can't change." };
        const target = batch.rows.find((r) => r.position === row);
        if (!target) return { error: `The batch has no row ${row}.` };
        if (!cells && included === undefined)
          return { error: "Nothing to change." };
        let values: Record<string, string> | undefined;
        if (cells) {
          values = { ...target.data.values };
          for (const [key, value] of Object.entries(cells)) {
            if (value === undefined) continue;
            if (value) values[key] = value;
            else delete values[key];
          }
        }
        try {
          await saveBatchRow(ctx.db, target.id, { values, included });
        } catch {
          return { error: "The row could not be saved just now." };
        }
        const fresh = await loadBatch(ctx.db, batchId);
        return fresh
          ? { changedRow: row, ...batchSummary(fresh) }
          : { error: "The batch could not be read back." };
      },
    }),
});

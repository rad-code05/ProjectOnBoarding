import { tool } from "ai";
import * as z from "zod";
import { loadBatch, saveBatchDefaults } from "@/lib/requests/batch/store";
import { batchSummary, sameForEveryoneSchema } from "./batch-shared";
import { defineTool } from "./types";

/**
 * "Same for everyone" on the person's own open leaver batch (F17b-5d):
 * like the box on the batch page — the values given replace the saved ones,
 * the rest stay; every row is checked again. Nothing created, so no
 * Confirm. Admin / requester.
 */
export const setSameForEveryone = defineTool({
  name: "setSameForEveryone",
  roles: ["admin", "requester"],
  kind: "own",
  needsApproval: false,
  build: (ctx) =>
    tool({
      description:
        "Set values for every leaver of an open leaver batch, as the person said them (SLA, cut-off time, handover, removal method, mailbox); a row's own value still wins. Every row is checked again; report what is still wrong.",
      inputSchema: z.object({
        batchId: z.uuid(),
        values: sameForEveryoneSchema,
      }),
      execute: async ({ batchId, values }) => {
        const batch = await loadBatch(ctx.db, batchId);
        if (!batch) return { error: "No such batch among yours." };
        if (batch.type !== "offboarding")
          return { error: "Only a batch of leavers has values for everyone." };
        if (batch.status !== "open")
          return { error: "This batch was already created; it can't change." };
        const merged: Record<string, string> = {
          ...(batch.defaults as Record<string, string>),
        };
        for (const [key, value] of Object.entries(values))
          if (value) merged[key] = value;
        try {
          await saveBatchDefaults(ctx.db, batchId, merged);
        } catch {
          return { error: "The values could not be saved just now." };
        }
        const fresh = await loadBatch(ctx.db, batchId);
        return fresh
          ? batchSummary(fresh)
          : { error: "The batch could not be read back." };
      },
    }),
});

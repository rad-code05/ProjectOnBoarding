import { tool } from "ai";
import * as z from "zod";
import { loadBatch } from "@/lib/requests/batch/store";
import { batchSummary } from "./batch-shared";
import { defineTool } from "./types";

/**
 * Reads one of the person's batches (F17b-4): a file attached with the
 * paperclip arrives as "Attached list … (batch <id>)". Own batches only
 * (RLS). Admin / requester.
 */
export const getBatch = defineTool({
  name: "getBatch",
  roles: ["admin", "requester"],
  kind: "read",
  needsApproval: false,
  build: (ctx) =>
    tool({
      description:
        "Read one of the person's batches by its id (a file attached in the chat says 'batch <id>'): who is ready, who needs attention and why, who is left out. Then list the problems in plain words and offer to fix them; nothing is created until they confirm.",
      inputSchema: z.object({ batchId: z.uuid() }),
      execute: async ({ batchId }) => {
        const batch = await loadBatch(ctx.db, batchId);
        if (!batch)
          return {
            error:
              "No such batch among yours (batches are kept 7 days). Ask the person to attach the list again.",
          };
        return batchSummary(batch);
      },
    }),
});

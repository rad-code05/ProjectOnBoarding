import { tool } from "ai";
import * as z from "zod";
import { confirmBatch, loadBatch } from "@/lib/requests/batch/store";
import { BATCH_LINK, batchSummary, confirmMismatch } from "./batch-shared";
import { defineTool } from "./types";

const names = (what: string) =>
  z.array(z.string().trim().min(1).max(200)).max(50).describe(what);

export const createBatchDraftsSchema = z.object({
  batchId: z.uuid(),
  create: names(
    "The names of the ready rows, exactly as the batch lists them (readyNames).",
  ),
  notCreated: names(
    "The names of every other row (notCreated), exactly as the batch lists them.",
  ),
});

/**
 * Confirm a batch by chat (F17b-4, board *Confirm the batch*): one draft per
 * ready, included row — the same `create_batch_drafts()` as the batch page
 * (all or nothing, values written straight in, source ai). A write: the
 * person sees the names on the Confirm card first, and the server checks
 * they are exactly the batch's ready rows before the card shows.
 */
export const createBatchDrafts = defineTool({
  name: "createBatchDrafts",
  roles: ["admin", "requester"],
  kind: "write",
  needsApproval: true,
  precheck: async (input, ctx) => {
    const parsed = createBatchDraftsSchema.safeParse(input);
    if (!parsed.success) return "The input is not valid. Call again.";
    const batch = await loadBatch(ctx.db, parsed.data.batchId);
    if (!batch) return "No such batch among yours.";
    return confirmMismatch(
      batchSummary(batch),
      parsed.data.create,
      parsed.data.notCreated,
    );
  },
  build: (ctx) =>
    tool({
      description:
        "Create the drafts of a batch once the person asks for it: one draft onboarding per ready row; rows that need attention or are left out are not created. The person sees the names and must Confirm. Pass the batch's readyNames as create and the other rows' names as notCreated, exactly. Afterwards say how many drafts were created and that each is executed and signed one by one.",
      inputSchema: createBatchDraftsSchema,
      execute: async ({ batchId, create, notCreated }) => {
        // The person may have changed the batch page since the card showed.
        const batch = await loadBatch(ctx.db, batchId);
        if (!batch)
          return { created: false, error: "No such batch among yours." };
        const changed = confirmMismatch(
          batchSummary(batch),
          create,
          notCreated,
        );
        if (changed)
          return {
            created: false,
            error:
              "The batch changed since the Confirm card. Nothing was created.",
            ...batchSummary(batch),
          };
        const result = await confirmBatch(ctx.db, batchId);
        if (!result.ok) return { created: false, error: result.message };
        const done = await loadBatch(ctx.db, batchId);
        return {
          created: true,
          drafts: result.created.length,
          link: BATCH_LINK(batchId),
          tickets: (done?.rows ?? [])
            .filter((r) => r.ticketId)
            .map((r) => r.ticketId),
        };
      },
    }),
});

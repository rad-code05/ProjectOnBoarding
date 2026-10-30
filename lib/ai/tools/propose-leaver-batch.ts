import { tool } from "ai";
import * as z from "zod";
import { MAX_ROWS } from "@/lib/requests/batch/table";
import { batchLeaverSchema, sameForEveryoneSchema } from "./batch-shared";
import { makeChatBatch } from "./propose-batch";
import { defineTool } from "./types";

/**
 * A list of leavers from the chat → a batch (F17b-5d): each leaver found
 * among the people who hold something today, the values shared by everyone
 * saved once on the batch ("Same for everyone"). Nothing is created — the
 * person confirms (createBatchDrafts). Own batch only, so no Confirm here.
 * Admin / requester.
 */
export const proposeLeaverBatch = defineTool({
  name: "proposeLeaverBatch",
  roles: ["admin", "requester"],
  kind: "own",
  needsApproval: false,
  build: (ctx) =>
    tool({
      description: [
        "Put 2 or more leavers from the person's message into a batch (one draft offboarding per person later, after their Confirm). createOffboardingDraft is for a single leaver.",
        "Each leaver: name or work email as said and the last working day (YYYY-MM-DD). Values for everyone (SLA, cut-off time, handover, removal method, mailbox) go in sameForEveryone once; a leaver's own value only when it differs. Never invent a value: what is missing is flagged by the batch — ask about it, then setSameForEveryone or fixBatchRow.",
        "Afterwards list the problems in plain words and say nothing is created until they confirm; the step line has the link to open the batch.",
      ].join(" "),
      inputSchema: z.object({
        title: z
          .string()
          .trim()
          .max(80)
          .optional()
          .describe("A short name, e.g. 'Leavers end of November'."),
        leavers: z.array(batchLeaverSchema).min(2).max(MAX_ROWS),
        sameForEveryone: sameForEveryoneSchema.optional(),
      }),
      execute: ({ title, leavers, sameForEveryone }) =>
        makeChatBatch(
          ctx.db,
          "offboarding",
          title,
          leavers,
          sameForEveryone ?? {},
        ),
    }),
});

import { tool } from "ai";
import * as z from "zod";
import { loadBatch, makeBatch } from "@/lib/requests/batch/store";
import { batchPeopleSchema, batchSummary, personCells } from "./batch-shared";
import { defineTool } from "./types";

/**
 * A list of joiners from the chat → a batch (F17b-4, board *Batch by chat*):
 * every row checked like an uploaded file, nothing created — the person
 * opens the batch, fixes or unticks rows and confirms (createBatchDrafts).
 * Saves only the asker's own batch (RLS; audited `batch.made`), so no
 * Confirm. Admin / requester.
 */
export const proposeBatch = defineTool({
  name: "proposeBatch",
  roles: ["admin", "requester"],
  kind: "own",
  needsApproval: false,
  build: (ctx) =>
    tool({
      description: [
        "Put 2 or more joiners from the person's message into a batch (one draft onboarding per person later, after their Confirm). Use it instead of asking about each person one by one; createOnboardingDraft is for a single joiner.",
        "Write each person's values as the person said them (shared values such as 'all Dubai, start 2 November' go on every person); turn relative dates into YYYY-MM-DD. Never invent a work email: only when given, or when the person states a pattern ('usual emails' = first.last@laine.ai only if they said that pattern earlier or confirm it — say it in your answer).",
        "The batch checks every row against the form's lists. Afterwards list the problems in plain words (row name + what is wrong + the closest valid name if obvious) and say that nothing is created until they confirm; the step line has the link to open the batch.",
        "Batches of leavers and role changes are not ready yet: for those, do them one by one.",
      ].join(" "),
      inputSchema: z.object({
        title: z
          .string()
          .trim()
          .max(80)
          .optional()
          .describe("A short name, e.g. 'Joiners 2 November'."),
        people: batchPeopleSchema,
      }),
      execute: async ({ title, people }) => {
        let id: string;
        try {
          id = await makeBatch(ctx.db, {
            type: "onboarding",
            title: title || "Batch from the chat",
            source: "chat",
            records: people.map((p, i) => ({
              position: i + 1,
              values: personCells(p),
              other: {},
            })),
          });
        } catch {
          return {
            error:
              "The batch could not be saved (only admins and requesters can make one).",
          };
        }
        const batch = await loadBatch(ctx.db, id);
        if (!batch) return { error: "The batch could not be read back." };
        return batchSummary(batch);
      },
    }),
});

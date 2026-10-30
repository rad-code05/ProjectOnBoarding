import { tool } from "ai";
import * as z from "zod";
import { MAX_ROWS } from "@/lib/requests/batch/table";
import { batchChangeSchema } from "./batch-shared";
import { makeChatBatch } from "./propose-batch";
import { defineTool } from "./types";

/**
 * A list of role changes from the chat → a batch (F17b-5d): each row
 * checked against what the person holds today (new roles, removals,
 * additions). Nothing is created — the person confirms (createBatchDrafts).
 * Own batch only, so no Confirm here. Admin / requester.
 */
export const proposeChangeBatch = defineTool({
  name: "proposeChangeBatch",
  roles: ["admin", "requester"],
  kind: "own",
  needsApproval: false,
  build: (ctx) =>
    tool({
      description: [
        "Put access changes for 2 or more people from the person's message into a batch (one draft access change per person later, after their Confirm). createAccessChangeDraft is for a single person.",
        "Each person: name or work email as said, the effective date (YYYY-MM-DD; a shared date goes on every person), and what changes — change (something they hold, the new role in brackets), remove (names or asset tags), add (something new). Use the names as getPersonAccess / getCatalog give them; never guess a role.",
        "The batch checks every row against what the person holds. Afterwards list the problems in plain words and say nothing is created until they confirm; the step line has the link to open the batch.",
      ].join(" "),
      inputSchema: z.object({
        title: z
          .string()
          .trim()
          .max(80)
          .optional()
          .describe("A short name, e.g. 'Role changes 1 December'."),
        people: z.array(batchChangeSchema).min(2).max(MAX_ROWS),
      }),
      execute: ({ title, people }) =>
        makeChatBatch(ctx.db, "access_modification", title, people),
    }),
});

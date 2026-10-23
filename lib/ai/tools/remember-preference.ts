import { tool } from "ai";
import * as z from "zod";
import { cleanCallMe } from "@/lib/ai/memory";
import { remember } from "@/lib/ai/memory-store";
import { ALL_ROLES, defineTool } from "./types";

/**
 * "Call me Raj" — the name the assistant uses from now on, saved only when
 * the person asks for it (their own memory; they see and clear it on My
 * profile).
 */
export const rememberPreference = defineTool({
  name: "rememberPreference",
  roles: ALL_ROLES,
  kind: "memory",
  needsApproval: false,
  build: (ctx) =>
    tool({
      description: [
        'Save the name the person wants to be called, ONLY when they ask for it ("call me Raj").',
        "Never guess it and never save anything else here. They can see and clear their memory on My profile.",
      ].join(" "),
      inputSchema: z.object({
        callMe: z.string().trim().min(1).max(40).describe("The name to use."),
      }),
      execute: async ({ callMe }) => {
        const name = cleanCallMe(callMe);
        if (!name) {
          return {
            error:
              "That name can't be saved. Ask for a name of letters only, up to 40.",
          };
        }
        const ok = await remember(ctx.db, ctx.userId, { callMe: name });
        return ok
          ? { saved: name, note: "From now on, address them with this name." }
          : { error: "The name could not be saved just now." };
      },
    }),
});

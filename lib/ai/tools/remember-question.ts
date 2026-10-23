import { tool } from "ai";
import * as z from "zod";
import { cleanQuestion, namesSomeone } from "@/lib/ai/memory";
import { remember } from "@/lib/ai/memory-store";
import { personName } from "@/lib/requests/labels";
import { ALL_ROLES, defineTool } from "./types";

/**
 * Frequent questions (decided 2026-10-23): after answering a question with
 * the app's data, a short GENERAL version is kept — no people's names,
 * emails or tickets, at most 80 characters, the last 5. Never the chat text.
 */
export const rememberQuestion = defineTool({
  name: "rememberQuestion",
  roles: ALL_ROLES,
  kind: "memory",
  needsApproval: false,
  build: (ctx) =>
    tool({
      description: [
        "After you answered a question with report, people, access or request data, save a short GENERAL version of it, so it can be suggested next time.",
        'Rewrite it in general words: no people\'s names, emails, ticket numbers or dates ("Who has Admin rights in any application?", not "Does Rose have Admin in Cursor?"). At most 80 characters.',
        "Skip help questions and small talk. Don't mention saving it in your answer.",
      ].join(" "),
      inputSchema: z.object({
        question: z
          .string()
          .trim()
          .min(8)
          .max(120)
          .describe("The general version of the question."),
      }),
      execute: async ({ question }) => {
        const q = cleanQuestion(question);
        if (!q) return { saved: false };
        // The model is asked to leave names out; the server checks anyway.
        const people = await ctx.db
          .from("employees")
          .select("first_name, last_name");
        if (people.error) return { saved: false };
        const names = (people.data ?? []).map((p) =>
          personName(p.first_name, p.last_name),
        );
        if (namesSomeone(q, names)) return { saved: false };
        return { saved: await remember(ctx.db, ctx.userId, { question: q }) };
      },
    }),
});

import { tool } from "ai";
import * as z from "zod";
import { cleanQuestion, namesSomeone } from "@/lib/ai/memory";
import { remember } from "@/lib/ai/memory-store";
import { personName } from "@/lib/requests/labels";
import { ALL_ROLES, defineTool } from "./types";

/**
 * What the model reads back after saving: the call is invisible to the
 * person, so an answer must still follow (2026-11-01: after this call the
 * model once wrote only "Nothing more to add" — the numbers never shown).
 */
export const ANSWER_STILL_DUE =
  "Saved silently — the person does not see this call. If you haven't written your answer yet, write the full answer now (the numbers, names or facts you found), as if this call never happened.";

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
        "Skip help questions and small talk. The person never sees this call: it never replaces your answer — always write the full answer in your reply, and don't mention saving it.",
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
        if (!q) return { saved: false, next: ANSWER_STILL_DUE };
        // The model is asked to leave names out; the server checks anyway.
        const people = await ctx.db
          .from("employees")
          .select("first_name, last_name");
        if (people.error) return { saved: false, next: ANSWER_STILL_DUE };
        const names = (people.data ?? []).map((p) =>
          personName(p.first_name, p.last_name),
        );
        if (namesSomeone(q, names))
          return { saved: false, next: ANSWER_STILL_DUE };
        return {
          saved: await remember(ctx.db, ctx.userId, { question: q }),
          next: ANSWER_STILL_DUE,
        };
      },
    }),
});

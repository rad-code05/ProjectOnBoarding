import { tool } from "ai";
import * as z from "zod";
import { helpTopicsFor } from "@/lib/ai/knowledge";
import { ALL_ROLES, defineTool } from "./types";

/**
 * Questions about the app ("What does Returned mean?"): answers come only
 * from our help library — the topics this person may read.
 */
export const getAppHelp = defineTool({
  name: "getAppHelp",
  roles: ALL_ROLES,
  kind: "read",
  needsApproval: false,
  build: (ctx) => {
    const topics = helpTopicsFor(ctx.roles);
    const ids = topics.map((t) => t.id) as [string, ...string[]];
    return tool({
      description: [
        "Read a page of the Laine onboarding rights help library to answer a question about how the app works.",
        "Answer only from the page's text and name the page as the source.",
        "Topics:",
        ...topics.map((t) => `- ${t.id}: ${t.summary}`),
      ].join("\n"),
      inputSchema: z.object({
        topic: z.enum(ids).describe("The help page to read."),
      }),
      execute: async ({ topic }) => {
        const page = topics.find((t) => t.id === topic);
        if (!page) return { error: "No such help page." };
        return {
          title: page.title,
          text: page.text,
          source: `Help: ${page.title}`,
        };
      },
    });
  },
});

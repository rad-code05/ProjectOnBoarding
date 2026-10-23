import { tool } from "ai";
import * as z from "zod";
import { formatDay } from "@/lib/requests/format";
import { STATE_LABELS, TYPE_LABELS } from "@/lib/requests/labels";
import { loadHeld, loadOpenRequests, loadPeople } from "./people-load";
import { IT_SIDE, displayName, pickPerson } from "./people-shared";
import { defineTool } from "./types";

const KIND_WORDS = {
  application: "Application",
  equipment: "Equipment",
  access: "Physical / logical access",
} as const;

/**
 * "What does Rose hold today?" — one person's applications (with their
 * permission), equipment and access, from the access inventory. The IT
 * side only, never approvers.
 */
export const getPersonAccess = defineTool({
  name: "getPersonAccess",
  roles: IT_SIDE,
  kind: "read",
  needsApproval: false,
  build: (ctx) =>
    tool({
      description: [
        "List everything one person holds today: applications with their permission, equipment and physical / logical access, each with the date it was granted; plus their open requests.",
        "Give the person's name or work email. If several people match, the result lists them: ask which one is meant, never pick one yourself.",
      ].join(" "),
      inputSchema: z.object({
        person: z
          .string()
          .trim()
          .min(2)
          .max(80)
          .describe("The person's name or work email."),
      }),
      execute: async ({ person }) => {
        try {
          const picked = pickPerson(await loadPeople(ctx.db), person);
          if ("matches" in picked) {
            return picked.matches.length === 0
              ? {
                  person,
                  error: `Nobody called "${person}" is known to the app. Ask for another spelling or the work email.`,
                }
              : {
                  person,
                  error: "Several people match. Ask which one is meant.",
                  matches: picked.matches
                    .slice(0, 10)
                    .map((p) => `${displayName(p)} (${p.email})`),
                };
          }
          const p = picked.person;
          const [held, open] = await Promise.all([
            loadHeld(ctx.db, [p.id]),
            loadOpenRequests(ctx.db, [p.id]),
          ]);
          return {
            person: displayName(p),
            email: p.email,
            holds: held.map((h) => ({
              kind: KIND_WORDS[h.kind],
              item: h.item,
              permission: h.permission,
              since: formatDay(h.since, ctx.timeZone),
            })),
            leaving: open.some((r) => r.type === "offboarding"),
            openRequests: open.map(
              (r) =>
                `${r.ticket}: ${TYPE_LABELS[r.type]}, ${STATE_LABELS[r.state]}`,
            ),
            note: "Only access granted by closed requests is listed; staff from before the app appear once the Excel import is done.",
            source: `Access inventory: ${displayName(p)}, today`,
          };
        } catch {
          return {
            person,
            error: "The access inventory could not be read just now.",
          };
        }
      },
    }),
});

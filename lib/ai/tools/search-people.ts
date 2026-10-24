import { tool } from "ai";
import * as z from "zod";
import { formatDay } from "@/lib/requests/format";
import { STATE_LABELS, TYPE_LABELS, countryName } from "@/lib/requests/labels";
import { nationalityText } from "@/lib/requests/signing";
import { loadHeld, loadOpenRequests, loadPeople } from "./people-load";
import { IT_SIDE, displayName, findPeople } from "./people-shared";
import { defineTool } from "./types";

const MAX_PEOPLE = 10;

/**
 * "Who is Rose Bernal?" — people the app knows (everyone a request is
 * about), found by name or work email, with where they work, how much they
 * hold and their open requests. The IT side only, never approvers.
 */
export const searchPeople = defineTool({
  name: "searchPeople",
  roles: IT_SIDE,
  kind: "read",
  needsApproval: false,
  build: (ctx) =>
    tool({
      description: [
        "Find people by name or work email (part of either is enough).",
        "Returns who they are (job title, department, office, country from their latest request), how many items they hold today, and their open requests.",
        "If several people match, list them and ask which one is meant. To see what one person holds, use getPersonAccess.",
      ].join(" "),
      inputSchema: z.object({
        query: z
          .string()
          .trim()
          .min(2)
          .max(80)
          .describe("A name, part of a name or a work email."),
      }),
      execute: async ({ query }) => {
        try {
          const found = findPeople(await loadPeople(ctx.db), query);
          if (found.length === 0) {
            return {
              query,
              people: [],
              note: `Nobody called "${query}" is known to the app. Ask for another spelling or the work email; people from before the app appear once the Excel import is done.`,
            };
          }
          const shown = found.slice(0, MAX_PEOPLE);
          const ids = shown.map((p) => p.id);
          const [held, open, latest] = await Promise.all([
            loadHeld(ctx.db, ids),
            loadOpenRequests(ctx.db, ids),
            ctx.db
              .from("requests")
              .select(
                "employee_id, job_title, country, nationalities, office:offices(name), department:departments(name)",
              )
              .in("employee_id", ids)
              .neq("state", "cancelled")
              .order("created_at", { ascending: false }),
          ]);
          if (latest.error) throw new Error(latest.error.message);
          return {
            query,
            people: shown.map((p) => {
              const last = (latest.data ?? []).find(
                (r) => r.employee_id === p.id,
              );
              const items = held.filter((h) => h.employeeId === p.id);
              return {
                name: displayName(p),
                email: p.email,
                jobTitle: last?.job_title ?? null,
                department: last?.department?.name ?? null,
                office: last?.office?.name ?? null,
                country: last?.country ? countryName(last.country) : null,
                nationality: nationalityText(last?.nationalities) || null,
                itemsHeld: items.length,
                holdsSince: items[0]
                  ? formatDay(items[0].since, ctx.timeZone)
                  : null,
                openRequests: open
                  .filter((r) => r.employeeId === p.id)
                  .map(
                    (r) =>
                      `${r.ticket}: ${TYPE_LABELS[r.type]}, ${STATE_LABELS[r.state]}`,
                  ),
              };
            }),
            more: Math.max(0, found.length - shown.length),
            source: "People and the access inventory (closed requests)",
          };
        } catch {
          return {
            query,
            error: "The people list could not be read just now.",
          };
        }
      },
    }),
});

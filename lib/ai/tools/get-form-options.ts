import { tool } from "ai";
import * as z from "zod";
import { normalize } from "./people-shared";
import { loadFormOptions } from "./onboarding-load";
import { defineTool } from "./types";

/**
 * The request form's own lists (F16c): departments, offices (and, for the
 * US, states and the cities added so far), equipment types and access
 * types with their scopes — so an onboarding prepared by chat uses names
 * that exist. Applications and their roles: getCatalog. Admin / requester.
 */
export const getFormOptions = defineTool({
  name: "getFormOptions",
  roles: ["admin", "requester"],
  kind: "read",
  needsApproval: false,
  build: (ctx) =>
    tool({
      description: [
        "The request form's lists: departments, offices (US: states and the cities added so far), equipment types, access types and their scopes.",
        "Use the names exactly as listed when you prepare a request. Applications and their roles: getCatalog.",
      ].join(" "),
      inputSchema: z.object({
        citySearch: z
          .string()
          .trim()
          .max(60)
          .optional()
          .describe("US cities whose name contains this (there are hundreds)."),
      }),
      execute: async ({ citySearch }) => {
        try {
          const o = await loadFormOptions(ctx.db);
          const want = citySearch ? normalize(citySearch) : null;
          const region = new Map(o.regions.map((r) => [r.id, r.name]));
          return {
            departments: o.departments.map((d) => d.name),
            offices: o.offices.map((x) => ({
              name: x.name,
              country: x.country,
              usesStates: x.usesRegions,
            })),
            usCities: want
              ? o.cities
                  .filter((c) => normalize(c.name).includes(want))
                  .slice(0, 20)
                  .map((c) => `${c.name}, ${region.get(c.regionId) ?? ""}`)
              : `${o.cities.length} cities — pass citySearch to look one up.`,
            equipment: o.equipment.map((e) => e.name),
            access: o.access.map((a) => ({ name: a.name, scopes: a.scopes })),
          };
        } catch {
          return { error: "The form's lists could not be read just now." };
        }
      },
    }),
});

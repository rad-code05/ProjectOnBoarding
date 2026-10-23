import { tool } from "ai";
import * as z from "zod";
import { formatDay } from "@/lib/requests/format";
import { leavingIds, loadHeld, loadOpenRequests } from "./people-load";
import {
  IT_SIDE,
  groupHolders,
  matchesItem,
  matchesPermission,
} from "./people-shared";
import { defineTool } from "./types";

const MAX_HOLDERS = 200;

/**
 * "Who has Figma Admin?", "Who has Admin anywhere?", "Who holds a laptop?"
 * — holders today, across every application, equipment and access type in
 * ONE call, by item, by permission or both. The IT side only.
 */
export const whoHasAccess = defineTool({
  name: "whoHasAccess",
  roles: IT_SIDE,
  kind: "read",
  needsApproval: false,
  build: (ctx) =>
    tool({
      description: [
        "Who holds something today, grouped per item: by item name (an application, equipment or access type), by permission (for example Admin), or both.",
        "A permission alone searches every application at once: use ONE call for questions like 'who has admin rights in any application', never one call per application.",
        "Leaving = an offboarding is open for that person.",
      ].join(" "),
      inputSchema: z
        .object({
          item: z
            .string()
            .trim()
            .min(1)
            .max(80)
            .optional()
            .describe("Part of the item's name, for example Figma or Laptop."),
          permission: z
            .string()
            .trim()
            .min(1)
            .max(80)
            .optional()
            .describe("Part of the permission, for example Admin."),
          kind: z
            .enum(["application", "equipment", "access"])
            .optional()
            .describe("Only applications, equipment or access types."),
        })
        .refine((v) => v.item || v.permission, {
          message: "Give an item, a permission or both.",
        }),
      execute: async ({ item, permission, kind }) => {
        const asked = [item, permission && `permission ${permission}`]
          .filter(Boolean)
          .join(", ");
        try {
          const [held, open] = await Promise.all([
            loadHeld(ctx.db),
            loadOpenRequests(ctx.db),
          ]);
          const rows = held.filter(
            (h) =>
              (!kind || h.kind === kind) &&
              (!item || matchesItem(h.item, item)) &&
              (!permission || matchesPermission(h.permission, permission)),
          );
          if (rows.length === 0 && item && !(await isKnownItem(ctx, item))) {
            return {
              asked,
              error: `No application, equipment or access type called "${item}" is in the catalog. Ask which one is meant, or use getCatalog.`,
            };
          }
          const groups = groupHolders(
            rows.slice(0, MAX_HOLDERS),
            leavingIds(open),
          );
          return {
            asked,
            people: new Set(rows.map((r) => r.employeeId)).size,
            items: groups.map((g) => ({
              ...g,
              holders: g.holders.map((h) => ({
                ...h,
                since: formatDay(h.since, ctx.timeZone),
              })),
            })),
            more: Math.max(0, rows.length - MAX_HOLDERS),
            note: "Only access granted by closed requests is counted; staff from before the app appear once the Excel import is done.",
            source: `Access inventory today: ${asked}`,
          };
        } catch {
          return {
            asked,
            error: "The access inventory could not be read just now.",
          };
        }
      },
    }),
});

/** Is there any catalog item (active or retired) with this in its name? */
async function isKnownItem(
  ctx: Parameters<typeof whoHasAccess.build>[0],
  item: string,
): Promise<boolean> {
  const [apps, equipment, access] = await Promise.all([
    ctx.db.from("catalog_apps").select("name"),
    ctx.db.from("equipment_types").select("name"),
    ctx.db.from("physical_access_types").select("name"),
  ]);
  return [apps, equipment, access].some((result) =>
    (result.data ?? []).some((row) => matchesItem(row.name, item)),
  );
}

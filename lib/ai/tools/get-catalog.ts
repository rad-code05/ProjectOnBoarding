import { tool } from "ai";
import * as z from "zod";
import { IT_SIDE, matchesItem } from "./people-shared";
import { defineTool } from "./types";

/**
 * "What permissions does Figma have?", "Which applications do we offer?"
 * — the catalog as requests offer it: active applications with their
 * category and permissions, equipment types, physical / logical access
 * types with their scopes. The IT side only.
 */
export const getCatalog = defineTool({
  name: "getCatalog",
  roles: IT_SIDE,
  kind: "read",
  needsApproval: false,
  build: (ctx) =>
    tool({
      description: [
        "The catalog requests offer today: applications (category, the permissions each offers, whether several can be held at once), equipment types, and physical / logical access types with their scopes.",
        "Use it for 'what permissions / access types does X have' or 'which applications do we have'. It doesn't say who holds what: use whoHasAccess for that.",
      ].join(" "),
      inputSchema: z.object({
        kind: z
          .enum(["applications", "equipment", "access", "all"])
          .default("all")
          .describe("Which part of the catalog."),
        search: z
          .string()
          .trim()
          .max(80)
          .optional()
          .describe("Only items whose name contains this, for example Figma."),
      }),
      execute: async ({ kind, search }) => {
        const keep = (name: string) => !search || matchesItem(name, search);
        try {
          const [categories, apps, equipment, access] = await Promise.all([
            ctx.db.from("catalog_categories").select("id, name"),
            ctx.db
              .from("catalog_apps")
              .select("name, category_id, permissions, multi_permission")
              .eq("active", true)
              .order("sort_order"),
            ctx.db
              .from("equipment_types")
              .select("name")
              .eq("active", true)
              .order("sort_order"),
            ctx.db
              .from("physical_access_types")
              .select("name, scopes")
              .eq("active", true)
              .order("sort_order"),
          ]);
          for (const r of [categories, apps, equipment, access]) {
            if (r.error) throw new Error(r.error.message);
          }
          const category = new Map(
            (categories.data ?? []).map((c) => [c.id, c.name]),
          );
          const want = (k: string) => kind === "all" || kind === k;
          return {
            applications: want("applications")
              ? (apps.data ?? [])
                  .filter((a) => keep(a.name))
                  .map((a) => ({
                    name: a.name,
                    category: category.get(a.category_id) ?? null,
                    permissions: a.permissions,
                    severalAtOnce: a.multi_permission,
                  }))
              : undefined,
            equipment: want("equipment")
              ? (equipment.data ?? [])
                  .filter((e) => keep(e.name))
                  .map((e) => e.name)
              : undefined,
            access: want("access")
              ? (access.data ?? [])
                  .filter((a) => keep(a.name))
                  .map((a) => ({ name: a.name, scopes: a.scopes }))
              : undefined,
            source: search ? `Catalog: ${search}` : "Catalog",
          };
        } catch {
          return { error: "The catalog could not be read just now." };
        }
      },
    }),
});

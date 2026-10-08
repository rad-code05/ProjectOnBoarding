import * as z from "zod";

/** One application of the catalog, with its own actions and permissions. */
export type CatalogApp = {
  id: number;
  name: string;
  actions: string[];
  permissions: string[];
};

export type CatalogCategory = { id: number; name: string; apps: CatalogApp[] };

/** What a request says about one catalog app (section 5). */
export type AccessChoice = {
  action: string;
  permission: string | null;
  notes: string | null;
};

/** App id → choice; apps without a row are "not set". */
export type AccessChoices = Record<number, AccessChoice>;

export const setAccessSchema = z.object({
  requestId: z.uuid(),
  appId: z.int().positive(),
  action: z.string().trim().min(1).max(40),
  permission: z
    .string()
    .trim()
    .max(80)
    .nullable()
    .transform((value) => value || null),
  notes: z
    .string()
    .trim()
    .max(500, "Keep notes under 500 characters.")
    .nullable()
    .transform((value) => value || null),
});

export const clearAccessSchema = z.object({
  requestId: z.uuid(),
  appId: z.int().positive(),
});

export type AccessResult = { ok: true } | { ok: false; message: string };

/** "Grant · Editor", or "Not set". */
export function choiceLabel(choice: AccessChoice | undefined): string {
  if (!choice) return "Not set";
  return [choice.action, choice.permission].filter(Boolean).join(" · ");
}

/** Apps matching the search (name contains every word), per category. */
export function filterCatalog(
  categories: CatalogCategory[],
  choices: AccessChoices,
  query: string,
  onlySet: boolean,
): CatalogCategory[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return categories
    .map((category) => ({
      ...category,
      apps: category.apps.filter(
        (app) =>
          (!onlySet || choices[app.id]) &&
          words.every((word) => app.name.toLowerCase().includes(word)),
      ),
    }))
    .filter((category) => category.apps.length > 0);
}

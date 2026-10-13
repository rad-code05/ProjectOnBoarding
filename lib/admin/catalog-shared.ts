/**
 * Admin · Applications (F19c): pure helpers shared by the server and the
 * screen — the actions an application may offer, filtering the list, and
 * turning the database's refusals into plain words.
 */

/** The actions an application can offer (database: admin_save_app). */
export const APP_ACTIONS = [
  "Grant",
  "Modify",
  "Remove",
  "Enroll",
  "Disable",
] as const;

export type AdminCategory = { id: number; name: string; active: boolean };

export type AdminApp = {
  id: number;
  name: string;
  categoryId: number;
  actions: string[];
  permissions: string[];
  /** A request row may hold several permissions at once (Google Cloud roles). */
  multiple: boolean;
  active: boolean;
  /** How many requests chose it (they keep its name if it changes). */
  uses: number;
};

/** The chip filter: all active apps, one category, or the retired ones. */
export type AppFilter = "all" | "retired" | number;

/** "Grant · Modify · Remove — Viewer / Editor / Admin" (+ "· several at once"). */
export function optionsLine(
  app: Pick<AdminApp, "actions" | "permissions"> & { multiple?: boolean },
) {
  const line = `${app.actions.join(" · ")} — ${app.permissions.join(" / ")}`;
  return app.multiple ? `${line} · several at once` : line;
}

/**
 * The apps to show, grouped by category in order: search by name (every
 * word), then the chip (all active / one category / retired).
 */
export function filterApps(
  categories: AdminCategory[],
  apps: AdminApp[],
  query: string,
  filter: AppFilter,
): { category: AdminCategory; apps: AdminApp[] }[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = (app: AdminApp) =>
    words.every((word) => app.name.toLowerCase().includes(word)) &&
    (filter === "retired" ? !app.active : app.active) &&
    (typeof filter !== "number" || app.categoryId === filter);
  return categories
    .map((category) => ({
      category,
      apps: apps.filter(
        (app) => app.categoryId === category.id && matches(app),
      ),
    }))
    .filter((group) => group.apps.length > 0);
}

/** Database refusals → words for the admin. */
export function catalogErrorMessage(
  code: string | undefined,
  message: string | undefined,
): string {
  if (code === "42501") return "Only an admin changes the lists.";
  if ((code === "23505" || code === "23514") && message) {
    return message.charAt(0).toUpperCase() + message.slice(1) + ".";
  }
  return "Could not save. Reload and try again.";
}

// ---------------------------------------------------------------------------
// Equipment & access types (F19d)
// ---------------------------------------------------------------------------

/** Section 6 actions (database: admin_save_equipment_type). */
export const EQUIPMENT_ACTIONS = ["Issue", "Return"] as const;
/** Section 7 actions (database: admin_save_access_type). */
export const ACCESS_ACTIONS = ["Grant", "Modify", "Remove", "Disable"] as const;

export type AdminEquipmentType = {
  id: number;
  name: string;
  actions: string[];
  needsDescription: boolean;
  active: boolean;
  uses: number;
};

export type AdminAccessType = {
  id: number;
  name: string;
  actions: string[];
  scopes: string[];
  active: boolean;
  uses: number;
};

/** "Issue · Return — needs a description" / "Grant · Disable — Badge / Key". */
export function typeLine(
  type: { actions: string[] } & (
    { needsDescription: boolean } | { scopes: string[] }
  ),
): string {
  const actions = type.actions.join(" · ");
  if ("scopes" in type) return `${actions} — ${type.scopes.join(" / ")}`;
  return type.needsDescription ? `${actions} — needs a description` : actions;
}

import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { AdminApp, AdminCategory } from "./catalog-shared";

/**
 * Everything Admin · Applications shows: categories and applications
 * (active and retired) with how many requests used each one.
 */
export async function loadCatalogAdmin(): Promise<{
  categories: AdminCategory[];
  apps: AdminApp[];
}> {
  const supabase = createServerSupabaseClient();
  const [categories, apps, used] = await Promise.all([
    supabase
      .from("catalog_categories")
      .select("id, name, active")
      .order("sort_order"),
    supabase
      .from("catalog_apps")
      .select("id, name, category_id, actions, permissions, active")
      .order("sort_order"),
    supabase
      .from("request_access_items")
      .select("app_id")
      .not("app_id", "is", null),
  ]);
  for (const result of [categories, apps, used]) {
    if (result.error) {
      throw new Error(`Could not load the catalog: ${result.error.message}`);
    }
  }
  const uses = new Map<number, number>();
  for (const row of used.data ?? []) {
    if (row.app_id !== null) {
      uses.set(row.app_id, (uses.get(row.app_id) ?? 0) + 1);
    }
  }
  return {
    categories: categories.data ?? [],
    apps: (apps.data ?? []).map((app) => ({
      id: app.id,
      name: app.name,
      categoryId: app.category_id,
      actions: app.actions,
      permissions: app.permissions,
      active: app.active,
      uses: uses.get(app.id) ?? 0,
    })),
  };
}

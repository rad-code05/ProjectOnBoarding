import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type {
  AdminAccessType,
  AdminApp,
  AdminCategory,
  AdminEquipmentType,
} from "./catalog-shared";

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

/** Admin · Equipment & access types: both lists, with uses per type. */
export async function loadTypesAdmin(): Promise<{
  equipment: AdminEquipmentType[];
  access: AdminAccessType[];
}> {
  const supabase = createServerSupabaseClient();
  const [equipment, access, equipmentUsed, accessUsed] = await Promise.all([
    supabase
      .from("equipment_types")
      .select("id, name, actions, needs_description, active")
      .order("sort_order"),
    supabase
      .from("physical_access_types")
      .select("id, name, actions, scopes, active")
      .order("sort_order"),
    supabase.from("request_equipment_items").select("type_id"),
    supabase.from("request_physical_access_items").select("type_id"),
  ]);
  for (const result of [equipment, access, equipmentUsed, accessUsed]) {
    if (result.error) {
      throw new Error(`Could not load the types: ${result.error.message}`);
    }
  }
  const count = (rows: { type_id: number }[] | null) => {
    const map = new Map<number, number>();
    for (const row of rows ?? []) {
      map.set(row.type_id, (map.get(row.type_id) ?? 0) + 1);
    }
    return map;
  };
  const eqUses = count(equipmentUsed.data);
  const acUses = count(accessUsed.data);
  return {
    equipment: (equipment.data ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      actions: t.actions,
      needsDescription: t.needs_description,
      active: t.active,
      uses: eqUses.get(t.id) ?? 0,
    })),
    access: (access.data ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      actions: t.actions,
      scopes: t.scopes,
      active: t.active,
      uses: acUses.get(t.id) ?? 0,
    })),
  };
}

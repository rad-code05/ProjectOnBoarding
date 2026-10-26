import type { ServerSupabase } from "@/lib/supabase/server";
import type { FormOptions } from "./onboarding-shared";

/**
 * The form's lists as the request form offers them (active only): what an
 * onboarding prepared by chat may use. Read with the person's own session.
 */
export async function loadFormOptions(
  db: ServerSupabase,
): Promise<FormOptions> {
  const [departments, offices, regions, cities, apps, equipment, access] =
    await Promise.all([
      db
        .from("departments")
        .select("id, name")
        .eq("active", true)
        .order("sort_order"),
      db
        .from("offices")
        .select("id, name, country, uses_regions")
        .eq("active", true)
        .order("sort_order"),
      db.from("country_regions").select("id, country, name").order("name"),
      db
        .from("office_cities")
        .select("id, office_id, region_id, name")
        .eq("active", true)
        .order("name"),
      db
        .from("catalog_apps")
        .select("id, name, actions, permissions, multi_permission")
        .eq("active", true)
        .order("sort_order"),
      db
        .from("equipment_types")
        .select("id, name, actions")
        .eq("active", true)
        .order("sort_order"),
      db
        .from("physical_access_types")
        .select("id, name, actions, scopes")
        .eq("active", true)
        .order("sort_order"),
    ]);
  for (const r of [
    departments,
    offices,
    regions,
    cities,
    apps,
    equipment,
    access,
  ]) {
    if (r.error) throw new Error(r.error.message);
  }
  return {
    departments: departments.data ?? [],
    offices: (offices.data ?? []).map((o) => ({
      id: o.id,
      name: o.name,
      country: o.country,
      usesRegions: o.uses_regions,
    })),
    regions: regions.data ?? [],
    cities: (cities.data ?? []).map((c) => ({
      id: c.id,
      officeId: c.office_id,
      regionId: c.region_id,
      name: c.name,
    })),
    apps: (apps.data ?? []).map((a) => ({
      id: a.id,
      name: a.name,
      actions: a.actions,
      permissions: a.permissions,
      multiple: a.multi_permission,
    })),
    equipment: equipment.data ?? [],
    access: (access.data ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      actions: t.actions,
      scopes: t.scopes ?? [],
    })),
  };
}

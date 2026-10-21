import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { AdminCity, AdminOffice, AdminRegion } from "./offices-shared";

/**
 * Everything Admin · Offices shows: offices (active and retired), the
 * regions of countries that have them (US states) and the offices' cities,
 * each with how many requests name it.
 */
export async function loadOfficesAdmin(): Promise<{
  offices: AdminOffice[];
  regions: AdminRegion[];
  cities: AdminCity[];
}> {
  const supabase = createServerSupabaseClient();
  const [offices, regions, cities, used] = await Promise.all([
    supabase
      .from("offices")
      .select("id, name, city, country, uses_regions, active")
      .order("sort_order"),
    supabase.from("country_regions").select("id, country, name").order("name"),
    supabase
      .from("office_cities")
      .select("id, office_id, region_id, name, active")
      .order("name"),
    supabase
      .from("requests")
      .select("office_id, office_city_id")
      .not("office_id", "is", null),
  ]);
  for (const result of [offices, regions, cities, used]) {
    if (result.error) {
      throw new Error(`Could not load the offices: ${result.error.message}`);
    }
  }
  const officeUses = new Map<number, number>();
  const cityUses = new Map<number, number>();
  for (const row of used.data ?? []) {
    if (row.office_id !== null) {
      officeUses.set(row.office_id, (officeUses.get(row.office_id) ?? 0) + 1);
    }
    if (row.office_city_id !== null) {
      cityUses.set(
        row.office_city_id,
        (cityUses.get(row.office_city_id) ?? 0) + 1,
      );
    }
  }
  return {
    offices: (offices.data ?? []).map((o) => ({
      id: o.id,
      name: o.name,
      city: o.city,
      country: o.country,
      usesRegions: o.uses_regions,
      active: o.active,
      uses: officeUses.get(o.id) ?? 0,
    })),
    regions: regions.data ?? [],
    cities: (cities.data ?? []).map((c) => ({
      id: c.id,
      officeId: c.office_id,
      regionId: c.region_id,
      name: c.name,
      active: c.active,
      uses: cityUses.get(c.id) ?? 0,
    })),
  };
}

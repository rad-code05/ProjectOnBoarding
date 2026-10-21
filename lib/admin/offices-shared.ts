import { countryName } from "@/lib/requests/labels";

/** An office as Admin · Offices shows it (board: Phone · Admin · Offices). */
export type AdminOffice = {
  id: number;
  name: string;
  city: string | null;
  country: string;
  usesRegions: boolean;
  active: boolean;
  /** Requests that name this office. */
  uses: number;
};

/** A state / region of a country (US: the 50 states + DC). */
export type AdminRegion = { id: number; country: string; name: string };

/** A city of an office, in a region. */
export type AdminCity = {
  id: number;
  officeId: number;
  regionId: number;
  name: string;
  active: boolean;
  uses: number;
};

/** "Dubai · United Arab Emirates" / "United States". */
export function officePlace(office: Pick<AdminOffice, "city" | "country">) {
  return [office.city, countryName(office.country)].filter(Boolean).join(" · ");
}

/** The office's second line: "No sub-locations" or "State, then city · 4 cities". */
export function officeLine(office: AdminOffice, cities: AdminCity[]): string {
  if (!office.usesRegions) return "No sub-locations";
  const n = cities.filter((c) => c.officeId === office.id && c.active).length;
  return `State, then city · ${n} cit${n === 1 ? "y" : "ies"}`;
}

/** "on 12 requests" / "on 1 request" / "not used yet". */
export function usesLine(uses: number): string {
  if (uses === 0) return "not used yet";
  return `on ${uses} request${uses === 1 ? "" : "s"}`;
}

export type CityGroup = { region: AdminRegion; cities: AdminCity[] };

/**
 * An office's cities grouped by state, states in alphabetical order and
 * cities by name; only states that have cities.
 */
export function citiesByRegion(
  officeId: number,
  cities: AdminCity[],
  regions: AdminRegion[],
): CityGroup[] {
  const mine = cities.filter((c) => c.officeId === officeId);
  return regions
    .map((region) => ({
      region,
      cities: mine
        .filter((c) => c.regionId === region.id)
        .sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .filter((g) => g.cities.length > 0)
    .sort((a, b) => a.region.name.localeCompare(b.region.name));
}

/** Countries that have states / regions on file (today only the US). */
export function countriesWithRegions(regions: AdminRegion[]): Set<string> {
  return new Set(regions.map((r) => r.country));
}

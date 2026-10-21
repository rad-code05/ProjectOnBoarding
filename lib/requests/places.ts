import type { Choice } from "./fields";
import type { FormPlaces } from "./form";
import { countryName } from "./labels";

type Office = FormPlaces["offices"][number];

/** The office with this id ("" / unknown = none). */
export function officeOf(places: FormPlaces, officeId: string): Office | null {
  return places.offices.find((o) => String(o.id) === officeId) ?? null;
}

/** Does the chosen office ask for a state and a city? */
export function usesRegions(places: FormPlaces, officeId: string): boolean {
  return officeOf(places, officeId)?.usesRegions ?? false;
}

/** The states of the office's country (US: the 50 states + DC). */
export function regionChoices(places: FormPlaces, officeId: string): Choice[] {
  const office = officeOf(places, officeId);
  if (!office?.usesRegions) return [];
  return places.regions
    .filter((r) => r.country === office.country)
    .map((r) => ({ value: String(r.id), label: r.name }));
}

/** The office's cities in the chosen state (retired ones only if chosen). */
export function cityChoices(
  places: FormPlaces,
  officeId: string,
  regionId: string,
  current: string,
): Choice[] {
  if (!officeId || !regionId) return [];
  return places.cities
    .filter(
      (c) =>
        String(c.officeId) === officeId &&
        String(c.regionId) === regionId &&
        (c.active || String(c.id) === current),
    )
    .map((c) => ({
      value: String(c.id),
      label: c.active ? c.name : `${c.name} (retired)`,
    }));
}

/** "Texas" for a state id. */
export function regionName(places: FormPlaces, regionId: string): string {
  return places.regions.find((r) => String(r.id) === regionId)?.name ?? "";
}

/**
 * What else changes when one of the place fields changes: a new office
 * fills the work country (still editable) and clears state and city; a
 * new state clears the city. Returns every field to set.
 */
export function placeChanges(
  places: FormPlaces,
  key: string,
  value: string,
): Record<string, string> {
  if (key === "office") {
    const office = officeOf(places, value);
    return {
      office: value,
      region: "",
      office_city: "",
      ...(office ? { country: office.country } : {}),
    };
  }
  if (key === "region") return { region: value, office_city: "" };
  return { [key]: value };
}

/** Access change "Was: …" for the place fields and nationalities. */
export function placeWas(
  key: string,
  now: string,
  previous: {
    office_id: number | null;
    office: string | null;
    region_id: number | null;
    region: string | null;
    office_city_id: number | null;
    office_city: string | null;
    nationalities: string[];
  },
): string | null {
  const changed = (id: number | null) => String(id ?? "") !== now;
  switch (key) {
    case "office":
      return changed(previous.office_id) ? previous.office || "—" : null;
    case "region":
      return changed(previous.region_id) ? previous.region || "—" : null;
    case "office_city":
      return changed(previous.office_city_id)
        ? previous.office_city || "—"
        : null;
    case "nationalities": {
      const before = previous.nationalities.join(",");
      return before !== now
        ? previous.nationalities.map(countryName).join(", ") || "—"
        : null;
    }
    default:
      return null;
  }
}

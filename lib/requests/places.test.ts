import { describe, expect, test } from "vitest";
import type { FormPlaces } from "./form";
import {
  cityChoices,
  placeChanges,
  placeWas,
  regionChoices,
  regionName,
  usesRegions,
} from "./places";

const places: FormPlaces = {
  offices: [
    { id: 1, name: "Dubai", country: "AE", usesRegions: false, active: true },
    { id: 4, name: "US", country: "US", usesRegions: true, active: true },
  ],
  regions: [
    { id: 44, country: "US", name: "Texas" },
    { id: 5, country: "US", name: "California" },
  ],
  cities: [
    { id: 7, officeId: 4, regionId: 44, name: "Austin", active: true },
    { id: 8, officeId: 4, regionId: 44, name: "Houston", active: false },
    { id: 9, officeId: 4, regionId: 5, name: "San Francisco", active: true },
  ],
};

describe("Office → State → City", () => {
  test("only the US asks for a state; its states; the state's cities", () => {
    expect(usesRegions(places, "1")).toBe(false);
    expect(usesRegions(places, "4")).toBe(true);
    expect(usesRegions(places, "")).toBe(false);
    expect(regionChoices(places, "1")).toEqual([]);
    expect(regionChoices(places, "4").map((c) => c.label)).toEqual([
      "Texas",
      "California",
    ]);
    expect(cityChoices(places, "4", "44", "").map((c) => c.label)).toEqual([
      "Austin",
    ]);
    expect(cityChoices(places, "4", "44", "8").map((c) => c.label)).toEqual([
      "Austin",
      "Houston (retired)",
    ]);
    expect(cityChoices(places, "4", "", "")).toEqual([]);
    expect(regionName(places, "44")).toBe("Texas");
  });

  test("a new office fills the country and clears state and city", () => {
    expect(placeChanges(places, "office", "4")).toEqual({
      office: "4",
      region: "",
      office_city: "",
      country: "US",
    });
    expect(placeChanges(places, "office", "")).toEqual({
      office: "",
      region: "",
      office_city: "",
    });
    expect(placeChanges(places, "region", "5")).toEqual({
      region: "5",
      office_city: "",
    });
    expect(placeChanges(places, "job_title", "Lead")).toEqual({
      job_title: "Lead",
    });
  });

  test("access change: Was: … for office, state, city, nationalities", () => {
    const previous = {
      office_id: 2,
      office: "Geneva",
      region_id: null,
      region: null,
      office_city_id: null,
      office_city: null,
      nationalities: ["CH"],
    };
    expect(placeWas("office", "1", previous)).toBe("Geneva");
    expect(placeWas("office", "2", previous)).toBeNull();
    expect(placeWas("region", "44", previous)).toBe("—");
    expect(placeWas("nationalities", "CH,IT", previous)).toBe("Switzerland");
    expect(placeWas("nationalities", "CH", previous)).toBeNull();
    expect(placeWas("job_title", "x", previous)).toBeNull();
  });
});

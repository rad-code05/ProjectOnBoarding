import { describe, expect, test } from "vitest";
import {
  citiesByRegion,
  countriesWithRegions,
  officeLine,
  officePlace,
  usesLine,
  type AdminCity,
  type AdminOffice,
  type AdminRegion,
} from "./offices-shared";

const us: AdminOffice = {
  id: 4,
  name: "US",
  city: null,
  country: "US",
  usesRegions: true,
  active: true,
  uses: 9,
};
const dubai: AdminOffice = {
  ...us,
  id: 1,
  name: "Dubai",
  city: "Dubai",
  country: "AE",
  usesRegions: false,
};
const regions: AdminRegion[] = [
  { id: 44, country: "US", name: "Texas" },
  { id: 5, country: "US", name: "California" },
  { id: 33, country: "US", name: "New York" },
];
const city = (
  id: number,
  regionId: number,
  name: string,
  active = true,
): AdminCity => ({ id, officeId: 4, regionId, name, active, uses: 0 });
const cities = [
  city(1, 44, "Dallas"),
  city(2, 44, "Austin"),
  city(3, 5, "San Francisco"),
  city(4, 44, "Houston", false),
];

describe("office lines", () => {
  test("place, sub-locations and uses", () => {
    expect(officePlace(dubai)).toBe("Dubai · United Arab Emirates");
    expect(officePlace(us)).toBe("United States");
    expect(officeLine(dubai, cities)).toBe("No sub-locations");
    expect(officeLine(us, cities)).toBe("State, then city · 3 cities");
    expect(officeLine(us, [city(1, 44, "Austin")])).toBe(
      "State, then city · 1 city",
    );
    expect(usesLine(0)).toBe("not used yet");
    expect(usesLine(1)).toBe("on 1 request");
    expect(usesLine(12)).toBe("on 12 requests");
  });
});

describe("citiesByRegion", () => {
  test("states with cities, alphabetical, cities by name", () => {
    expect(
      citiesByRegion(4, cities, regions).map((g) => [
        g.region.name,
        g.cities.map((c) => c.name),
      ]),
    ).toEqual([
      ["California", ["San Francisco"]],
      ["Texas", ["Austin", "Dallas", "Houston"]],
    ]);
    expect(citiesByRegion(1, cities, regions)).toEqual([]);
  });
  test("countries with states", () => {
    expect([...countriesWithRegions(regions)]).toEqual(["US"]);
  });
});

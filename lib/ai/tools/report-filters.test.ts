import { describe, expect, test } from "vitest";
import {
  countryCode,
  duration,
  reportInput,
  resolveReportFilters,
  type FilterLists,
} from "./report-filters";

const lists: FilterLists = {
  departments: [{ id: 2, name: "Sales" }],
  offices: [
    { id: 1, name: "Dubai" },
    { id: 4, name: "US" },
  ],
  regions: [{ id: 44, name: "Texas" }],
  cities: [{ id: 9, regionId: 44, officeId: 4, name: "Austin" }],
};
const input = (x: object) => reportInput.parse({ report: "onboarded", ...x });

describe("countryCode", () => {
  test("names, codes and common short forms", () => {
    expect(countryCode("United Arab Emirates")).toBe("AE");
    expect(countryCode("UAE")).toBe("AE");
    expect(countryCode("us")).toBe("US");
    expect(countryCode("United States")).toBe("US");
    expect(countryCode("ch")).toBe("CH");
    expect(countryCode("switz")).toBe("CH");
    expect(countryCode("Atlantis")).toBeNull();
  });
});

describe("resolveReportFilters", () => {
  test("names become the Reports page's filters", () => {
    const { filters, unknown } = resolveReportFilters(
      input({
        office: "us",
        state: "texas",
        city: "Austin",
        department: "sales",
        country: "United States",
        nationality: "Swiss",
        period: "this_month",
      }),
      lists,
    );
    expect(unknown).toEqual(['nationality "Swiss"']);
    expect(filters).toMatchObject({
      office: 4,
      region: 44,
      city: 9,
      department: 2,
      country: "US",
      period: "month",
    });
  });

  test('default period = last 12 months; dates override; "not set"', () => {
    expect(resolveReportFilters(input({}), lists).filters.period).toBe("12m");
    expect(
      resolveReportFilters(
        input({ from: "2026-01-01", period: "this_month" }),
        lists,
      ).filters,
    ).toMatchObject({ from: "2026-01-01", to: null });
    expect(
      resolveReportFilters(
        input({ office: "not set", nationality: "none" }),
        lists,
      ).filters,
    ).toMatchObject({ office: 0, nationality: "none" });
  });

  test("names that match nothing are reported, never guessed", () => {
    const { unknown } = resolveReportFilters(
      input({ office: "Riyadh", department: "Magic", state: "Texas" }),
      lists,
    );
    expect(unknown).toEqual([
      'office "Riyadh"',
      'state "Texas" (choose the US office too)',
      'department "Magic"',
    ]);
  });

  test("the input refuses unknown reports and bad dates", () => {
    expect(reportInput.safeParse({ report: "salaries" }).success).toBe(false);
    expect(
      reportInput.safeParse({ report: "onboarded", from: "1 Jan" }).success,
    ).toBe(false);
  });
});

describe("duration", () => {
  test("minutes, hours, days", () => {
    expect(duration(40 * 60)).toBe("40 min");
    expect(duration(5 * 3600)).toBe("5 h");
    expect(duration(51 * 3600)).toBe("2 d 3 h");
    expect(duration(null)).toBeNull();
  });
});

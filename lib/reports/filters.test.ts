import { describe, expect, test } from "vitest";
import { exportFileName, exportFilters } from "./export";
import {
  DEFAULT_REPORT_FILTERS,
  filterWords,
  parseReportFilters,
  placeArgs,
  rangeLabel,
  reportChips,
  reportDays,
  reportNames,
  reportParams,
  reportRange,
} from "./filters";

const now = new Date("2026-10-15T08:00:00Z"); // 12:00 in Dubai

describe("parseReportFilters / reportParams", () => {
  test("defaults: last 12 months, nothing else", () => {
    expect(parseReportFilters({})).toEqual(DEFAULT_REPORT_FILTERS);
    expect(reportParams(DEFAULT_REPORT_FILTERS).toString()).toBe("");
  });

  test("reads every filter and round-trips; unknown values fall back", () => {
    const filters = parseReportFilters({
      q: " keller ",
      period: "3m",
      type: "offboarding",
      country: "ch",
      department: "4",
      limit: "40",
    });
    expect(filters).toEqual({
      ...DEFAULT_REPORT_FILTERS,
      q: "keller",
      period: "3m",
      type: "offboarding",
      country: "CH",
      department: 4,
      limit: 40,
    });
    expect(reportParams(filters).toString()).toBe(
      "q=keller&period=3m&type=offboarding&country=CH&department=4",
    );
    expect(
      parseReportFilters({
        period: "5y",
        type: "hiring",
        country: "Switzerland",
        department: "-1",
        limit: "9999",
        from: "2026-02-30x",
      }),
    ).toEqual({ ...DEFAULT_REPORT_FILTERS, limit: 500 });
  });
});

describe("reportDays / reportRange — company timezone", () => {
  test("12 months on 15 Oct 2026 = 16 Oct 2025 – 15 Oct 2026", () => {
    const days = reportDays(DEFAULT_REPORT_FILTERS, "Asia/Dubai", now);
    expect(days).toEqual({ first: "2025-10-16", last: "2026-10-15" });
    expect(rangeLabel(days)).toBe("16 Oct 2025 – 15 Oct 2026");
    expect(reportRange(DEFAULT_REPORT_FILTERS, "Asia/Dubai", now)).toEqual({
      from: "2025-10-15T20:00:00.000Z",
      to: "2026-10-15T20:00:00.000Z",
    });
  });

  test("this month, 3 months (short months clamp), all time, dates", () => {
    const f = DEFAULT_REPORT_FILTERS;
    expect(reportDays({ ...f, period: "month" }, "Asia/Dubai", now)).toEqual({
      first: "2026-10-01",
      last: "2026-10-15",
    });
    expect(
      reportDays(
        { ...f, period: "3m" },
        "Asia/Dubai",
        new Date("2026-05-31T08:00:00Z"),
      ),
    ).toEqual({ first: "2026-03-01", last: "2026-05-31" });
    expect(reportDays({ ...f, period: "all" }, "Asia/Dubai", now)).toEqual({
      first: null,
      last: null,
    });
    expect(rangeLabel({ first: null, last: null })).toBe("All time");
    expect(
      reportDays({ ...f, from: "2026-09-01", to: null }, "Asia/Dubai", now),
    ).toEqual({ first: "2026-09-01", last: null });
  });
});

describe("reportChips", () => {
  test("the period by default; every other filter removable", () => {
    expect(reportChips(DEFAULT_REPORT_FILTERS, {})).toEqual([
      { label: "Last 12 months", clear: { period: "all" } },
    ]);
    expect(
      reportChips(
        {
          ...DEFAULT_REPORT_FILTERS,
          from: "2026-10-01",
          to: "2026-10-15",
          type: "onboarding",
          country: "CH",
          department: 2,
        },
        { departments: { 2: "Sales" } },
      ).map((c) => c.label),
    ).toEqual([
      "1 Oct 2026 – 15 Oct 2026",
      "Onboarding",
      "Switzerland",
      "Sales",
    ]);
  });
});

describe("export", () => {
  test("file names carry the days covered", () => {
    expect(
      exportFileName(
        "all-users",
        { first: "2025-10-16", last: "2026-10-15" },
        "csv",
      ),
    ).toBe("all-users_2025-10-16_2026-10-15.csv");
    expect(
      exportFileName("all-users", { first: null, last: null }, "pdf"),
    ).toBe("all-users_all-time.pdf");
  });

  test("the audit entry stores the filters that were set", () => {
    expect(
      exportFilters(
        { ...DEFAULT_REPORT_FILTERS, period: "all", country: "CH" },
        "Asia/Dubai",
      ),
    ).toEqual({
      from: null,
      to: null,
      type: null,
      country: "CH",
      department: null,
      office: null,
      state: null,
      city: null,
      nationality: null,
      search: null,
    });
  });
});

describe("place filters (F27d)", () => {
  const names = {
    offices: { 4: "US", 1: "Dubai" },
    regions: { 44: "Texas" },
    cities: { 9: "Austin" },
  };

  test("office, state, city and nationality round-trip through the URL", () => {
    const filters = parseReportFilters({
      office: "4",
      state: "44",
      city: "9",
      nationality: "ch",
    });
    expect(filters).toMatchObject({
      office: 4,
      region: 44,
      city: 9,
      nationality: "CH",
    });
    expect(reportParams(filters).toString()).toBe(
      "office=4&state=44&city=9&nationality=CH",
    );
    expect(placeArgs(filters)).toEqual({
      p_office: 4,
      p_region: 44,
      p_city: 9,
      p_nationality: "CH",
    });
  });

  test('"Not set" is office 0 and nationality none; a state needs an office, a city a state', () => {
    expect(
      parseReportFilters({ office: "0", state: "44", nationality: "none" }),
    ).toMatchObject({ office: 0, region: null, nationality: "none" });
    expect(parseReportFilters({ state: "44", city: "9" })).toMatchObject({
      office: null,
      region: null,
      city: null,
    });
    expect(parseReportFilters({ office: "4", city: "9" }).city).toBeNull();
    expect(
      parseReportFilters({ office: "x", nationality: "Swiss" }),
    ).toMatchObject({ office: null, nationality: null });
  });

  test("chips and PDF words; removing the office takes its state and city along", () => {
    const filters = {
      ...DEFAULT_REPORT_FILTERS,
      period: "all" as const,
      office: 4,
      region: 44,
      city: 9,
      nationality: "CH",
    };
    const chips = reportChips(filters, names);
    expect(chips.map((c) => c.label)).toEqual([
      "US",
      "Texas",
      "Austin",
      "Nationality: Switzerland",
    ]);
    expect(chips[0].clear).toEqual({ office: null, region: null, city: null });
    expect(chips[1].clear).toEqual({ region: null, city: null });
    expect(filterWords(filters, names)).toEqual([
      "Office: US",
      "State: Texas",
      "City: Austin",
      "Nationality: Switzerland",
    ]);
    expect(
      reportChips(
        {
          ...filters,
          office: 0,
          region: null,
          city: null,
          nationality: "none",
        },
        names,
      ).map((c) => c.label),
    ).toEqual(["Office not set", "Nationality not set"]);
  });

  test("reportNames turns the options into lookups", () => {
    expect(
      reportNames({
        departments: [{ id: 2, name: "Sales" }],
        offices: [{ id: 1, name: "Dubai" }],
      }),
    ).toEqual({
      departments: { 2: "Sales" },
      offices: { 1: "Dubai" },
      regions: {},
      cities: {},
    });
  });
});

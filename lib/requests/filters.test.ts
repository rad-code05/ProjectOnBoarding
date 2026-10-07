import { describe, expect, test } from "vitest";
import {
  PAGE_SIZE,
  hasActiveFilters,
  parseFilters,
  searchTerms,
} from "./filters";

describe("parseFilters", () => {
  test("reads valid filters from the URL", () => {
    expect(
      parseFilters({
        q: " Anna ",
        type: "onboarding",
        status: "pending_confirmation",
        country: "ch",
        limit: "40",
      }),
    ).toEqual({
      q: "Anna",
      type: "onboarding",
      status: "pending_confirmation",
      country: "CH",
      limit: 40,
    });
  });

  test("ignores unknown or malformed values", () => {
    expect(
      parseFilters({
        type: "hiring",
        status: "deleted",
        country: "CHE",
        limit: "x",
      }),
    ).toEqual({
      q: "",
      type: null,
      status: null,
      country: null,
      limit: PAGE_SIZE,
    });
  });

  test("keeps the page size between one page and the maximum", () => {
    expect(parseFilters({ limit: "1" }).limit).toBe(PAGE_SIZE);
    expect(parseFilters({ limit: "99999" }).limit).toBe(500);
  });

  test("uses the first value when a parameter repeats", () => {
    expect(parseFilters({ type: ["offboarding", "onboarding"] }).type).toBe(
      "offboarding",
    );
  });
});

describe("searchTerms", () => {
  test("splits words and removes characters with a meaning in filters", () => {
    expect(searchTerms("Anna  Keller")).toEqual(["Anna", "Keller"]);
    expect(searchTerms("a,b(c)*%d\\e")).toEqual(["a", "b", "c", "d", "e"]);
  });

  test("keeps the work email and ticket ID searchable", () => {
    expect(searchTerms("anna.keller@laine.ai UAM-2026-000001")).toEqual([
      "anna.keller@laine.ai",
      "UAM-2026-000001",
    ]);
  });
});

test("hasActiveFilters", () => {
  expect(hasActiveFilters(parseFilters({}))).toBe(false);
  expect(hasActiveFilters(parseFilters({ q: "anna" }))).toBe(true);
  expect(hasActiveFilters(parseFilters({ limit: "40" }))).toBe(false);
});

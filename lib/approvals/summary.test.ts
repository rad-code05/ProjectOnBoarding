// @vitest-environment node
import { describe, expect, test } from "vitest";
import { dayStart, monthStart, weekStart } from "@/lib/time/zoned";
import { accessSummary } from "./summary";

describe("accessSummary", () => {
  test.each([
    [[], "—"],
    [["Figma"], "Figma"],
    [["Figma", "Slack", "Google Workspace"], "Figma, Slack, Google Workspace"],
    [
      ["Figma", "Slack", "Google Workspace", "GitHub", "Notion"],
      "Figma, Slack, Google Workspace +2",
    ],
  ])("%j → %s", (apps, expected) => {
    expect(accessSummary(apps)).toBe(expected);
  });
});

describe("monthStart", () => {
  test("the month starts at midnight in the company timezone, not UTC", () => {
    const dubai = "Asia/Dubai"; // UTC+4
    // 31 Oct 20:30 UTC is already 1 Nov 00:30 in Dubai.
    expect(monthStart(dubai, new Date("2026-10-31T20:30:00Z"))).toBe(
      "2026-10-31T20:00:00.000Z",
    );
    expect(monthStart(dubai, new Date("2026-10-31T19:30:00Z"))).toBe(
      "2026-09-30T20:00:00.000Z",
    );
    // Daylight saving: Zurich is UTC+2 on 1 Oct, UTC+1 on 1 Nov.
    expect(monthStart("Europe/Zurich", new Date("2026-11-15T12:00:00Z"))).toBe(
      "2026-10-31T23:00:00.000Z",
    );
  });
});

describe("dayStart / weekStart", () => {
  const dubai = "Asia/Dubai"; // UTC+4
  test("today starts at midnight in the company timezone", () => {
    // 23 Oct 21:00 UTC is already 24 Oct 01:00 in Dubai.
    expect(dayStart(dubai, new Date("2026-10-23T21:00:00Z"))).toBe(
      "2026-10-23T20:00:00.000Z",
    );
  });
  test("the week starts on Monday", () => {
    // Saturday 24 Oct 2026 → Monday 19 Oct, 00:00 in Dubai.
    expect(weekStart(dubai, new Date("2026-10-24T10:00:00Z"))).toBe(
      "2026-10-18T20:00:00.000Z",
    );
    // A Sunday belongs to the week that began the Monday before.
    expect(weekStart(dubai, new Date("2026-10-25T10:00:00Z"))).toBe(
      "2026-10-18T20:00:00.000Z",
    );
    // Monday itself.
    expect(weekStart(dubai, new Date("2026-10-19T10:00:00Z"))).toBe(
      "2026-10-18T20:00:00.000Z",
    );
  });
});

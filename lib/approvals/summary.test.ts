// @vitest-environment node
import { describe, expect, test } from "vitest";
import { monthStart } from "@/lib/time/zoned";
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

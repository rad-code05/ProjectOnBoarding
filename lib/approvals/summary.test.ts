import { describe, expect, test } from "vitest";
import { accessSummary, monthStart } from "./summary";

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
  test("uses the company timezone (Dubai), not UTC", () => {
    // 31 Oct 20:30 UTC is already 1 Nov 00:30 in Dubai (UTC+4).
    expect(monthStart(new Date("2026-10-31T20:30:00Z"))).toBe("2026-11-01");
    expect(monthStart(new Date("2026-10-31T19:30:00Z"))).toBe("2026-10-01");
    expect(monthStart(new Date("2026-10-09T12:00:00Z"))).toBe("2026-10-01");
  });
});

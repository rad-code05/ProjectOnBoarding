import { describe, expect, test } from "vitest";
import { zonedParts, zonedToIso } from "@/lib/time/zoned";
import { removalsSummary, slaDeadline } from "./offboarding";

describe("zoned date + time", () => {
  test("Dubai wall time ↔ UTC (no daylight saving)", () => {
    expect(zonedToIso("2026-09-30", "18:00", "Asia/Dubai")).toBe(
      "2026-09-30T14:00:00.000Z",
    );
    expect(zonedParts("2026-09-30T14:00:00.000Z", "Asia/Dubai")).toEqual({
      date: "2026-09-30",
      time: "18:00",
    });
  });

  test("a zone with daylight saving, on both sides of the change", () => {
    expect(zonedToIso("2026-07-01", "09:00", "Europe/Zurich")).toBe(
      "2026-07-01T07:00:00.000Z",
    );
    expect(zonedToIso("2026-12-01", "09:00", "Europe/Zurich")).toBe(
      "2026-12-01T08:00:00.000Z",
    );
  });

  test("the date can change across midnight", () => {
    expect(zonedParts("2026-09-30T21:30:00.000Z", "Asia/Dubai")).toEqual({
      date: "2026-10-01",
      time: "01:30",
    });
  });
});

describe("slaDeadline (same rule as the database)", () => {
  test("same day: 23:59:59 of the cut-off day, Dubai time", () => {
    expect(slaDeadline("same_day", "2026-09-30", "18:00", "Asia/Dubai")).toBe(
      "2026-09-30T19:59:59.000Z",
    );
  });

  test("24h / 48h after the cut-off", () => {
    expect(slaDeadline("within_24h", "2026-09-30", "18:00", "Asia/Dubai")).toBe(
      "2026-10-01T14:00:00.000Z",
    );
    expect(slaDeadline("within_48h", "2026-09-30", "18:00", "Asia/Dubai")).toBe(
      "2026-10-02T14:00:00.000Z",
    );
  });

  test("nothing until timeline, date and time are set", () => {
    expect(slaDeadline("", "2026-09-30", "18:00", "Asia/Dubai")).toBeNull();
    expect(slaDeadline("within_24h", "", "18:00", "Asia/Dubai")).toBeNull();
    expect(
      slaDeadline("within_24h", "2026-09-30", "", "Asia/Dubai"),
    ).toBeNull();
  });
});

test("removalsSummary", () => {
  expect(
    removalsSummary({
      apps: [
        { id: "a", name: "Slack", category: "Core", had: "Member" },
        { id: "b", name: "Figma", category: "Core", had: null },
      ],
      equipment: [
        {
          id: "c",
          name: "Laptop · macOS",
          assetTag: "LT-1",
          description: null,
        },
      ],
      access: [],
    }),
  ).toBe("2 applications, 1 device and 0 access types");
});

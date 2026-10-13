import { describe, expect, test } from "vitest";
import { zonedParts, zonedToIso } from "@/lib/time/zoned";
import {
  formatDuration,
  removalsSummary,
  slaDeadline,
  slaHeadline,
  splitBlockers,
} from "./offboarding";

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
        {
          id: "a",
          name: "Slack",
          category: "Core",
          had: "Member",
          method: null,
          doneAt: null,
        },
        {
          id: "b",
          name: "Figma",
          category: "Core",
          had: null,
          method: null,
          doneAt: null,
        },
      ],
      equipment: [
        {
          id: "c",
          name: "Laptop · macOS",
          assetTag: "LT-1",
          description: null,
          status: "pending",
          reason: null,
          recordedAt: null,
        },
      ],
      access: [],
    }),
  ).toBe("2 applications, 1 device and 0 access types");
});

describe("SLA during execution", () => {
  const due = "2026-10-01T14:00:00.000Z";
  const at = (iso: string) => new Date(iso).getTime();
  const open = { total: 10, done: 5, removedAt: null, met: null };

  test("formatDuration", () => {
    expect(formatDuration(6 * 3_600_000 + 12 * 60_000)).toBe("6h 12m");
    expect(formatDuration(2 * 86_400_000 + 3 * 3_600_000)).toBe("2d 3h");
    expect(formatDuration(45 * 60_000)).toBe("45m");
    expect(formatDuration(10_000)).toBe("1m");
  });

  test("due, overdue, met, missed", () => {
    expect(slaHeadline(due, open, at("2026-10-01T07:48:00Z"))).toEqual({
      kind: "due",
      text: "Due in 6h 12m",
    });
    expect(
      slaHeadline(due, { ...open, met: false }, at("2026-10-01T17:00:00Z")),
    ).toEqual({
      kind: "overdue",
      text: "Overdue by 3h",
    });
    expect(
      slaHeadline(
        due,
        { total: 3, done: 3, removedAt: "2026-10-01T10:12:00Z", met: true },
        at("2026-10-02T00:00:00Z"),
      ).text,
    ).toBe("Removed in time");
    expect(
      slaHeadline(
        due,
        { total: 3, done: 3, removedAt: "2026-10-01T17:12:00Z", met: false },
        at("2026-10-02T00:00:00Z"),
      ).text,
    ).toBe("Late by 3h 12m");
  });
});

test("splitBlockers: the database's offboarding lines get their own checks and sections", () => {
  // Exactly the labels private.offboarding_blockers() writes.
  const { fields, blockers } = splitBlockers([
    "Effective date",
    "At least one application or access to remove",
    "Removal method (Delete, Suspend or Disable) for 1 application(s)",
    "Applications removed (0 of 2)",
    "Access disabled or removed (0 of 1)",
    "Equipment received or marked not returned (0 of 1)",
    "Data & mailbox go to",
    "Mailbox: converted to a shared mailbox, or no mailbox to convert",
    "Reason the access removal SLA was missed",
  ]);
  expect(fields).toEqual(["Effective date"]);
  expect(blockers.map((b) => b.section)).toEqual([5, 5, 5, 7, 6, 7, 7, 8]);
});

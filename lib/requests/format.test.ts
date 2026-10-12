import { describe, expect, test } from "vitest";
import {
  formatDate,
  formatDay,
  formatDayTime,
  formatTime,
  formatUpdated,
} from "./format";

const now = new Date("2026-10-07T12:00:00Z");

describe("formatDate", () => {
  test("shows a date without shifting it across time zones", () => {
    expect(formatDate("2026-10-14")).toBe("14 Oct 2026");
  });
  test("shows a dash when there is no date yet", () => {
    expect(formatDate(null)).toBe("—");
  });
});

describe("formatUpdated", () => {
  test.each([
    ["2026-10-07T11:59:30Z", "Just now"],
    ["2026-10-07T11:55:00Z", "5 minutes ago"],
    ["2026-10-07T09:00:00Z", "3 hours ago"],
    ["2026-10-06T12:00:00Z", "yesterday"],
    ["2026-10-02T12:00:00Z", "5 days ago"],
    ["2026-09-01T12:00:00Z", "1 Sept 2026"],
  ])("%s → %s", (iso, expected) => {
    expect(formatUpdated(iso, now)).toBe(expected);
  });
});

describe("screen times in a person's timezone (F05e)", () => {
  const at = "2026-10-09T22:30:00Z";
  test("the company timezone (Asia/Dubai) is the default", () => {
    expect(formatDayTime(at)).toBe("10 Oct 2026, 02:30");
  });
  test("a person's own timezone moves the time — and sometimes the day", () => {
    expect(formatTime(at, "Europe/Zurich")).toBe("00:30");
    expect(formatDay(at, "Europe/Zurich")).toBe("10 Oct 2026");
    expect(formatDayTime(at, "America/New_York")).toBe("9 Oct 2026, 18:30");
  });
});

import { describe, expect, test } from "vitest";
import {
  axisTicks,
  monthLabel,
  monthLetter,
  monthSpan,
  summarise,
} from "./months";

describe("months", () => {
  test("labels", () => {
    expect(monthLabel("2026-08-01")).toBe("Aug 2026");
    expect(monthLetter("2026-08-01")).toBe("A");
  });

  const f = { period: "12m", from: null, to: null };

  test("periods are whole calendar months ending with this month", () => {
    expect(monthSpan(f, "2026-10-15", null)).toEqual({
      first: "2025-11-01",
      last: "2026-10-01",
    });
    expect(monthSpan({ ...f, period: "3m" }, "2026-01-31", null)).toEqual({
      first: "2025-11-01",
      last: "2026-01-01",
    });
    expect(monthSpan({ ...f, period: "month" }, "2026-10-15", null)).toEqual({
      first: "2026-10-01",
      last: "2026-10-01",
    });
  });

  test("picked dates = the months they fall in", () => {
    expect(
      monthSpan(
        { ...f, from: "2026-02-20", to: "2026-05-03" },
        "2026-10-15",
        null,
      ),
    ).toEqual({ first: "2026-02-01", last: "2026-05-01" });
    expect(
      monthSpan({ ...f, from: "2027-01-05", to: null }, "2026-10-15", null),
    ).toEqual({ first: "2026-10-01", last: "2026-10-01" });
  });

  test("all time starts at the first closed onboarding, else this month", () => {
    const all = { ...f, period: "all" };
    expect(monthSpan(all, "2026-10-15", "2026-03-20")).toEqual({
      first: "2026-03-01",
      last: "2026-10-01",
    });
    expect(monthSpan(all, "2026-10-15", null)).toEqual({
      first: "2026-10-01",
      last: "2026-10-01",
    });
  });

  test("tiles: total and the busiest month (latest on a tie)", () => {
    expect(
      summarise([
        { month: "2026-07-01", onboarded: 7 },
        { month: "2026-08-01", onboarded: 2 },
        { month: "2026-09-01", onboarded: 7 },
      ]),
    ).toEqual({ total: 16, busiest: { month: "2026-09-01", onboarded: 7 } });
    expect(summarise([{ month: "2026-07-01", onboarded: 0 }])).toEqual({
      total: 0,
      busiest: null,
    });
  });

  test("round axis ticks, never below 4", () => {
    expect(axisTicks(0)).toEqual([0, 2, 4]);
    expect(axisTicks(7)).toEqual([0, 4, 8]);
    expect(axisTicks(13)).toEqual([0, 5, 10, 15]);
    expect(axisTicks(23)).toEqual([0, 10, 20, 30]);
  });
});

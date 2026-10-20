import { describe, expect, test } from "vitest";
import { DEFAULT_REPORT_FILTERS } from "./filters";
import { slaRange, slaReportRow, slaSummary, type RawSlaRow } from "./sla";

const base: RawSlaRow = {
  id: "r1",
  ticket_id: "UAM-2026-000118",
  state: "closed",
  first_name: "Paul",
  last_name: "Martin",
  sla_timeline: "same_day",
  access_cutoff_at: "2026-10-12T08:00:00Z", // 12:00 in Dubai
  sla_due_at: "2026-10-12T19:59:59Z", // 23:59:59 in Dubai
  removals_total: 4,
  removals_done: 4,
  removed_at: "2026-10-12T12:20:00Z", // 16:20 in Dubai
  result: "met",
  sla_missed_reason: null,
};
const opts = {
  timeZone: "Asia/Dubai",
  canOpenRequests: true,
  isApprover: false,
};

describe("slaReportRow", () => {
  test("met: the margin before the deadline, all removals with the time", () => {
    const row = slaReportRow(base, opts);
    expect(row).toMatchObject({
      name: "Paul Martin",
      subtitle: "UAM-2026-000118 · Same day · Closed",
      result: "Met",
      tone: "met",
      cutoff: "12 Oct 2026, 12:00",
      deadline: "12 Oct 2026, 23:59",
      removals: "All 4 · 12 Oct 2026, 16:20",
      noteLabel: "Margin",
      note: "7h 40m before the deadline",
      href: "/records/r1",
    });
  });

  test("missed: the reason written, or that it is still missing", () => {
    const missed = {
      ...base,
      result: "missed",
      sla_missed_reason: "GitHub owner rights needed the org admin.",
    };
    expect(slaReportRow(missed, opts)).toMatchObject({
      result: "Missed",
      tone: "missed",
      noteLabel: "Reason",
      note: "GitHub owner rights needed the org admin.",
    });
    expect(slaReportRow({ ...missed, sla_missed_reason: " " }, opts).note).toBe(
      "No reason recorded yet",
    );
  });

  test("open and overdue: time left or late, removals so far, a request link", () => {
    const open: RawSlaRow = {
      ...base,
      state: "in_execution",
      removals_done: 3,
      removals_total: 5,
      removed_at: null,
      result: "open",
    };
    const now = new Date("2026-10-12T13:59:59Z"); // 6h before the deadline
    expect(slaReportRow(open, { ...opts, now })).toMatchObject({
      result: "Due in 6h",
      tone: "open",
      removals: "3 of 5 removed",
      note: "Not decided yet",
      href: "/requests/r1",
    });
    const late = new Date("2026-10-12T22:59:59Z");
    expect(
      slaReportRow({ ...open, result: "overdue" }, { ...opts, now: late }),
    ).toMatchObject({
      result: "Overdue 3h",
      tone: "open",
      note: "Will show as Missed — a reason is needed",
    });
  });

  test("approvers open the approval page; nobody else gets a link", () => {
    const waiting = { ...base, state: "pending_confirmation" as const };
    expect(
      slaReportRow(waiting, {
        ...opts,
        canOpenRequests: false,
        isApprover: true,
      }).href,
    ).toBe("/approvals/r1");
    expect(
      slaReportRow(waiting, { ...opts, canOpenRequests: false }).href,
    ).toBeNull();
  });
});

describe("slaSummary", () => {
  test("tiles and every timeline in order, zeros included", () => {
    const s = slaSummary([
      {
        sla_timeline: "within_24h",
        met: 3,
        missed: 1,
        open: 0,
        overdue: 1,
        no_removals: 0,
      },
      {
        sla_timeline: "same_day",
        met: 4,
        missed: 0,
        open: 1,
        overdue: 0,
        no_removals: 1,
      },
    ]);
    expect(s).toMatchObject({
      total: 11,
      met: 7,
      missed: 1,
      decided: 8,
      metPercent: 88,
      open: 2,
      overdue: 1,
    });
    expect(s.timelines.map((t) => [t.label, t.met, t.missed, t.open])).toEqual([
      ["Same day", 4, 0, 1],
      ["Within 24h", 3, 1, 1],
      ["Within 48h", 0, 0, 0],
    ]);
  });

  test("nothing decided yet = no percentage", () => {
    expect(slaSummary([]).metPercent).toBeNull();
  });
});

describe("slaRange", () => {
  const now = new Date("2026-10-20T10:00:00Z");
  test("a preset period keeps upcoming deadlines (no end)", () => {
    expect(slaRange(DEFAULT_REPORT_FILTERS, "Asia/Dubai", now)).toEqual({
      from: "2025-10-20T20:00:00.000Z", // 21 Oct 2025, 00:00 Dubai
      to: null,
    });
  });
  test("a typed end date is respected", () => {
    expect(
      slaRange(
        { ...DEFAULT_REPORT_FILTERS, from: "2026-10-01", to: "2026-10-15" },
        "Asia/Dubai",
        now,
      ),
    ).toEqual({
      from: "2026-09-30T20:00:00.000Z",
      to: "2026-10-15T20:00:00.000Z",
    });
  });
});

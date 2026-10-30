import { describe, expect, test } from "vitest";
import type { Leaver } from "@/lib/requests/leavers-shared";
import {
  checkLeaverBatch,
  checkLeaverRow,
  readDefaults,
  readMailbox,
  readMethod,
  readTime,
  readTimeline,
  type LeaverContext,
  type LeaverDefaults,
} from "./offboarding";

const leaver = (over: Partial<Leaver>): Leaver => ({
  id: "e1",
  name: "Arjun Mehta",
  email: "arjun.mehta@example.com",
  detail: "Sales · India",
  items: 4,
  since: "UAM-2026-000100",
  openTicket: null,
  openChange: null,
  ...over,
});

const ctx: LeaverContext = {
  leavers: [
    leaver({}),
    leaver({ id: "e2", name: "Sara Khan", email: "sara.khan@example.com" }),
    leaver({ id: "e3", name: "Sara Lopez", email: "sara.lopez@example.com" }),
    leaver({
      id: "e4",
      name: "Omar Haddad",
      email: "omar.haddad@example.com",
      openTicket: "UAM-2026-000390",
    }),
  ],
  today: "2026-10-29",
  timeZone: "Asia/Dubai",
};

const all: LeaverDefaults = {
  slaTimeline: "within_24h",
  cutoffTime: "18:00",
  handoverTo: "Line manager",
  removalMethod: "Suspend",
  mailbox: "converted_shared",
};

const fields = (problems: { field: string }[]) => problems.map((p) => p.field);

describe("reading leaver cells", () => {
  test("SLA words", () => {
    expect(readTimeline("Same day")).toBe("same_day");
    expect(readTimeline("24h")).toBe("within_24h");
    expect(readTimeline("Within 48 hours")).toBe("within_48h");
    expect(readTimeline("next week")).toBeNull();
  });

  test("times", () => {
    expect(readTime("18:00")).toBe("18:00");
    expect(readTime("9.30")).toBe("09:30");
    expect(readTime("18:00:00")).toBe("18:00");
    expect(readTime("6 pm")).toBe("18:00");
    expect(readTime("12am")).toBe("00:00");
    expect(readTime("18")).toBeNull();
    expect(readTime("25:00")).toBeNull();
  });

  test("removal method and mailbox", () => {
    expect(readMethod("suspend")).toBe("Suspend");
    expect(readMethod("Remove")).toBeNull();
    expect(readMailbox("Convert to a shared mailbox")).toBe("converted_shared");
    expect(readMailbox("Shared")).toBe("converted_shared");
    expect(readMailbox("No mailbox")).toBe("no_mailbox");
    expect(readMailbox("keep it")).toBeNull();
  });

  test("defaults keep only what reads", () => {
    expect(
      readDefaults({
        slaTimeline: "24h",
        cutoffTime: "6 pm",
        removalMethod: "drop",
        mailbox: "no",
        handoverTo: "  ",
      }),
    ).toEqual({
      slaTimeline: "within_24h",
      cutoffTime: "18:00",
      mailbox: "no_mailbox",
    });
    expect(readDefaults(null)).toEqual({});
  });
});

describe("checkLeaverRow", () => {
  test("a leaver with the defaults is ready, cut-off on the last day", () => {
    const r = checkLeaverRow(
      { person: "arjun.mehta@example.com", lastWorkingDay: "30/10/2026" },
      all,
      ctx,
    );
    expect(r.problems).toEqual([]);
    expect(r.employeeId).toBe("e1");
    const by = Object.fromEntries(r.writes.map((w) => [w.target, w.value]));
    expect(by).toMatchObject({
      sla_timeline: "within_24h",
      last_working_day: "2026-10-30",
      // 18:00 in Dubai (UTC+4).
      access_cutoff_at: "2026-10-30T14:00:00.000Z",
      handover_to: "Line manager",
      effective_date: "2026-10-30",
      mailbox: "converted_shared",
      removal_all: { method: "Suspend" },
    });
  });

  test("a row's own cells override the defaults", () => {
    const r = checkLeaverRow(
      {
        person: "Arjun",
        lastWorkingDay: "2026-11-05",
        cutoffDate: "2026-11-04",
        cutoffTime: "09:00",
        slaTimeline: "Same day",
        removalMethod: "Delete",
        mailbox: "No mailbox",
        handoverTo: "Priya Shah",
      },
      all,
      ctx,
    );
    expect(r.problems).toEqual([]);
    const by = Object.fromEntries(r.writes.map((w) => [w.target, w.value]));
    expect(by).toMatchObject({
      sla_timeline: "same_day",
      access_cutoff_at: "2026-11-04T05:00:00.000Z",
      handover_to: "Priya Shah",
      mailbox: "no_mailbox",
      removal_all: { method: "Delete" },
    });
  });

  test("nothing set anywhere: each missing value names its cell", () => {
    const r = checkLeaverRow(
      { person: "Arjun Mehta", lastWorkingDay: "2026-11-05" },
      {},
      ctx,
    );
    expect(fields(r.problems)).toEqual([
      "slaTimeline",
      "cutoffTime",
      "handoverTo",
      "removalMethod",
      "mailbox",
    ]);
    expect(r.problems[0].message).toContain("Same for everyone");
  });

  test("unreadable cells are problems, not the default", () => {
    const r = checkLeaverRow(
      {
        person: "Arjun Mehta",
        lastWorkingDay: "2026-11-05",
        slaTimeline: "soon",
        removalMethod: "Remove",
      },
      all,
      ctx,
    );
    expect(fields(r.problems)).toEqual(["slaTimeline", "removalMethod"]);
  });

  test("the person: unknown, two matches, already leaving, missing", () => {
    const check = (person: string) =>
      checkLeaverRow({ person, lastWorkingDay: "2026-11-05" }, all, ctx);
    expect(check("Nobody Here").problems[0].message).toContain(
      "holds anything",
    );
    const two = check("Sara");
    expect(two.employeeId).toBeNull();
    expect(two.problems[0].message).toContain("2 people match");
    expect(two.problems[0].message).toContain("sara.khan@example.com");
    expect(check("Omar Haddad").problems[0].message).toBe(
      "Already leaving · UAM-2026-000390",
    );
    expect(check("").problems[0]).toEqual({
      field: "person",
      message: "Name or work email missing — required",
    });
  });

  test("dates: required, readable, never in the past", () => {
    const check = (values: Record<string, string>) =>
      checkLeaverRow({ person: "Arjun Mehta", ...values }, all, ctx).problems;
    expect(check({})).toEqual([
      {
        field: "lastWorkingDay",
        message: "Last working day missing — required",
      },
    ]);
    expect(check({ lastWorkingDay: "soon" })[0].message).toContain(
      "isn't a date",
    );
    expect(check({ lastWorkingDay: "2026-10-01" })[0].message).toContain(
      "never backdated",
    );
    expect(
      fields(check({ lastWorkingDay: "2026-11-05", cutoffDate: "2026-10-01" })),
    ).toEqual(["cutoffDate"]);
  });
});

test("the same person twice: the later row is flagged", () => {
  const out = checkLeaverBatch(
    [
      {
        position: 2,
        values: {
          person: "arjun.mehta@example.com",
          lastWorkingDay: "2026-11-05",
        },
      },
      {
        position: 1,
        values: { person: "Arjun Mehta", lastWorkingDay: "2026-11-05" },
      },
    ],
    all,
    ctx,
  );
  expect(out.get(1)?.problems).toEqual([]);
  expect(out.get(2)?.problems).toEqual([
    { field: "person", message: "The same person as row 1" },
  ]);
});

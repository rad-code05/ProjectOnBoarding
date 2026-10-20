import { describe, expect, test } from "vitest";
import { openRow, openSummary, type RawOpenRow } from "./open";

const now = new Date("2026-10-20T10:05:00Z");
const base: RawOpenRow = {
  id: "r1",
  ticket_id: "UAM-2026-000127",
  type: "onboarding",
  state: "pending_confirmation",
  first_name: "Omar",
  last_name: "Haddad",
  work_email: "omar.haddad@example.test",
  created_at: "2026-10-09T06:00:00Z",
  waiting_since: "2026-10-14T08:05:00Z", // 6d 2h before now
  sla_due_at: null,
  sla_result: null,
};
const opts = {
  timeZone: "Asia/Dubai",
  now,
  canOpenRequests: true,
  isApprover: false,
};

describe("openRow", () => {
  test("who, ticket · type, waiting since the status, opened, a link", () => {
    expect(openRow(base, opts)).toMatchObject({
      name: "Omar Haddad",
      subtitle: "UAM-2026-000127 · Onboarding",
      waiting: "6d 2h",
      opened: "9 Oct 2026",
      sla: null,
      href: "/requests/r1",
    });
  });

  test("offboarding SLA in words: due, overdue, missed", () => {
    const off: RawOpenRow = {
      ...base,
      type: "offboarding",
      state: "in_execution",
      sla_due_at: "2026-10-20T16:05:00Z",
      sla_result: "open",
    };
    expect(openRow(off, opts).sla).toBe("Due in 6h");
    expect(
      openRow(
        { ...off, sla_due_at: "2026-10-20T07:05:00Z", sla_result: "overdue" },
        opts,
      ).sla,
    ).toBe("Overdue 3h");
    expect(openRow({ ...off, sla_result: "missed" }, opts).sla).toBe(
      "SLA missed",
    );
    expect(openRow({ ...off, sla_result: "met" }, opts).sla).toBeNull();
  });

  test("approvers open the approval page; a draft without a name", () => {
    expect(
      openRow(base, { ...opts, canOpenRequests: false, isApprover: true }).href,
    ).toBe("/approvals/r1");
    expect(
      openRow({ ...base, first_name: null, last_name: null }, opts).name,
    ).toBe("Unnamed person");
  });
});

describe("openSummary", () => {
  test("every status in board order, the tiles", () => {
    const raw: RawOpenRow[] = [
      base,
      {
        ...base,
        id: "r2",
        type: "offboarding",
        state: "in_execution",
        waiting_since: "2026-10-19T05:05:00Z",
        sla_due_at: "2026-10-20T07:05:00Z",
        sla_result: "overdue",
      },
      {
        ...base,
        id: "r3",
        state: "draft",
        waiting_since: "2026-10-08T10:05:00Z", // 12d
      },
    ];
    const s = openSummary(
      raw,
      raw.map((r) => openRow(r, opts)),
    );
    expect(s.groups.map((g) => [g.title, g.with, g.rows.length])).toEqual([
      ["Awaiting confirmation", "the approver", 1],
      ["In execution", "IT (Raju)", 1],
      ["Draft", "IT (Raju)", 1],
      ["Returned", "IT (Raju)", 0],
    ]);
    expect(s).toMatchObject({
      total: 3,
      withApprover: 1,
      withIt: 2,
      longest: { waiting: "12d", title: "Draft" },
      offboardings: 1,
      overdue: 1,
    });
  });

  test("nothing open", () => {
    expect(openSummary([], []).longest).toBeNull();
  });
});

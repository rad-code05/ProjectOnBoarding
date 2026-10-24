// @vitest-environment node
import { describe, expect, test, vi } from "vitest";
import {
  countNationalities,
  nationalityBreakdown,
} from "./nationality-breakdown";

vi.mock("server-only", () => ({}));

describe("countNationalities", () => {
  test("two nationalities count under both; none = not set", () => {
    expect(
      countNationalities([
        ["CH"],
        ["CH", "IT"],
        null,
        [],
        ["BD"],
        ["CH", "CH"],
      ]),
    ).toEqual({
      people: 6,
      notSet: 2,
      groups: [
        { code: "CH", people: 3 },
        { code: "BD", people: 1 },
        { code: "IT", people: 1 },
      ],
    });
  });
});

describe("nationalityBreakdown", () => {
  const run = async (input: object, rpc: ReturnType<typeof vi.fn>) => {
    const ctx = {
      userId: "u",
      roles: ["admin"],
      timeZone: "Asia/Dubai",
      db: { rpc },
    };
    const built = nationalityBreakdown.build(ctx as never) as unknown as {
      execute: (i: object, o: object) => Promise<Record<string, unknown>>;
    };
    return built.execute(input, { toolCallId: "1", messages: [] });
  };

  test("employees today, by nationality, in names", async () => {
    const rpc = vi.fn(async () => ({
      data: [
        { nationalities: ["CH"] },
        { nationalities: ["BD", "CH"] },
        { nationalities: null },
      ],
      error: null,
    }));
    const out = await run({ who: "employees" }, rpc);
    expect(rpc).toHaveBeenCalledWith("report_employees", { p_limit: 10_000 });
    expect(out).toMatchObject({
      who: "Employees",
      period: "Today",
      people: 3,
      nationalities: 2,
      groups: [
        { nationality: "Switzerland", people: 2 },
        { nationality: "Bangladesh", people: 1 },
      ],
      notSet: 1,
    });
  });

  test("onboarded = closed by the approver in the period (D16)", async () => {
    // Closed just now: always inside this month, whatever today is.
    const thisMonth = new Date().toISOString();
    const rpc = vi.fn(async () => ({
      data: [
        { state: "closed", closed_at: thisMonth, nationalities: ["CH"] },
        // Closed long ago: not this month.
        {
          state: "closed",
          closed_at: "2020-01-15T08:00:00Z",
          nationalities: ["IT"],
        },
        // Not closed: not onboarded.
        { state: "in_execution", closed_at: null, nationalities: ["FR"] },
      ],
      error: null,
    }));
    const out = await run({ who: "onboarded", period: "this_month" }, rpc);
    expect(rpc).toHaveBeenCalledWith("report_all_users", {
      p_type: "onboarding",
      p_limit: 10_000,
    });
    expect(out).toMatchObject({
      who: "Onboarded",
      people: 1,
      groups: [{ nationality: "Switzerland", people: 1 }],
    });
  });

  test("report readers only — like runReport", () => {
    expect(nationalityBreakdown.roles).toEqual([
      "admin",
      "approver",
      "auditor",
    ]);
  });
});

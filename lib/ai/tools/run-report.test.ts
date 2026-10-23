// @vitest-environment node
import { describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/reports/all-users", () => ({
  loadReportOptions: vi.fn(async () => ({
    departments: [],
    countries: ["US"],
    offices: [
      { id: 1, name: "Dubai", country: "AE", usesRegions: false, active: true },
      { id: 4, name: "US", country: "US", usesRegions: true, active: true },
    ],
    regions: [],
    cities: [],
    nationalities: [],
  })),
  loadAllUsers: vi.fn(),
}));
vi.mock("@/lib/reports/onboarded-by", () => ({
  loadOnboardedBy: vi.fn(async () => ({
    total: 3,
    rows: [{ key: "1", label: "Dubai", onboarded: 3, share: "100%" }],
  })),
}));

const { runReport } = await import("./run-report");
const { loadOnboardedBy } = await import("@/lib/reports/onboarded-by");

const ctx = {
  userId: "user_1",
  roles: ["approver" as const],
  timeZone: "Asia/Dubai",
  db: { fake: true } as never,
};
const exec = (input: object) =>
  runReport.build(ctx).execute!(
    input as never,
    { toolCallId: "1", messages: [] } as never,
  );

describe("runReport", () => {
  test("runs the report with the person's own database client and says what it used", async () => {
    const out = (await exec({
      report: "onboarded",
      groupBy: "office",
      office: "Dubai",
      period: "all_time",
    })) as Record<string, unknown>;
    expect(loadOnboardedBy).toHaveBeenCalledWith(
      "office",
      expect.objectContaining({ office: 1, period: "all" }),
      "Asia/Dubai",
      ctx.db,
    );
    expect(out).toMatchObject({
      report: "Onboarded by office",
      period: "All time",
      filters: ["Office: Dubai"],
      total: 3,
      groups: [{ office: "Dubai", onboarded: 3, share: "100%" }],
      link: "/reports/onboarded-by-office?period=all&office=1",
    });
  });

  test("an unknown name comes back as a question, not a number", async () => {
    await expect(
      exec({ report: "onboarded", office: "Riyadh" }),
    ).resolves.toEqual({
      error:
        'Not found: office "Riyadh". Ask the person which one they mean — never guess.',
    });
  });

  test("a failing report says so", async () => {
    vi.mocked(loadOnboardedBy).mockRejectedValueOnce(new Error("boom"));
    await expect(
      exec({ report: "onboarded", groupBy: "country" }),
    ).resolves.toEqual({
      error: "The report could not be loaded. Say so; don't guess.",
    });
  });

  test("report readers only: admin, approver, auditor", () => {
    expect(runReport.roles).toEqual(["admin", "approver", "auditor"]);
    expect(runReport.kind).toBe("read");
  });
});

// @vitest-environment node
import { describe, expect, test, vi } from "vitest";
import type { Role } from "@/lib/auth";
import { TOOLS, toolApprovalFor, toolNamesFor, toolsFor } from "./registry";
import { defineTool } from "./types";

vi.mock("server-only", () => ({}));

const ctx = (roles: Role[]) => ({
  userId: "user_1",
  roles,
  timeZone: "Asia/Dubai",
  db: {} as never,
});

describe("the tool registry (PROJECT_PLAN §6.6)", () => {
  test("never a tool that signs, approves, closes, deletes, runs SQL or searches the web", () => {
    const forbidden =
      /sign|confirm|approve|return|close|cancel|tick|role|setting|delete|remove|sql|query|web|search_web|publish/i;
    for (const t of TOOLS) expect(t.name).not.toMatch(forbidden);
  });

  test("every tool says who may use it and what kind it is; writes need a Confirm", () => {
    for (const t of TOOLS) {
      expect(t.roles.length).toBeGreaterThan(0);
      expect(["read", "propose", "write", "memory", "own"]).toContain(t.kind);
      if (t.kind === "write") expect(t.needsApproval).toBe(true);
    }
    expect(() =>
      defineTool({
        name: "createDraft",
        roles: ["admin"],
        kind: "write",
        needsApproval: false,
        build: () => ({}) as never,
      }),
    ).toThrow(/must need approval/);
  });

  test("tools are filtered by role — nobody gets a tool their roles don't allow", () => {
    // Everyone has their own memory (call me, favourite reports, questions).
    const memory = ["rememberPreference", "rememberQuestion"];
    expect(toolNamesFor(["approver"])).toEqual([
      "getAppHelp",
      "runReport",
      "nationalityBreakdown",
      "saveCustomReport",
      ...memory,
    ]);
    // Requester / IT operator alone: no report reader — no report tool,
    // but people & access questions.
    const people = [
      "searchPeople",
      "getPersonAccess",
      "whoHasAccess",
      "getCatalog",
      "listRequests",
      "getRequest",
    ];
    const peopleTools = [...people, ...memory];
    // Filling requests (F16c): admins and requesters only.
    const filling = ["getFormOptions", "createOnboardingDraft"];
    expect(toolNamesFor(["requester", "it_operator"])).toEqual([
      "getAppHelp",
      ...people,
      ...filling,
      ...memory,
    ]);
    expect(toolNamesFor(["it_operator"])).toEqual([
      "getAppHelp",
      ...peopleTools,
    ]);
    expect(toolNamesFor(["admin"])).toEqual([
      "getAppHelp",
      "runReport",
      "nationalityBreakdown",
      "saveCustomReport",
      ...people,
      ...filling,
      ...memory,
    ]);
    expect(toolNamesFor(["auditor"])).toEqual([
      "getAppHelp",
      "runReport",
      "nationalityBreakdown",
      "saveCustomReport",
      ...peopleTools,
    ]);
    expect(toolNamesFor([])).toEqual([]);
    expect(Object.keys(toolsFor(ctx(["approver"])))).toEqual([
      "getAppHelp",
      "runReport",
      "nationalityBreakdown",
      "saveCustomReport",
      ...memory,
    ]);
  });

  test("approvals: only write tools wait for a Confirm", () => {
    expect(toolApprovalFor(["admin", "requester", "it_operator"])).toEqual({
      createOnboardingDraft: "user-approval",
    });
    expect(toolApprovalFor(["it_operator", "approver", "auditor"])).toEqual({});
  });
});

describe("getAppHelp", () => {
  const run = async (roles: Role[], topic: string) => {
    const tool = toolsFor(ctx(roles)).getAppHelp;
    return tool.execute!({ topic }, { toolCallId: "1", messages: [] } as never);
  };

  test("answers from the help page and names it as the source", async () => {
    await expect(run(["approver"], "statuses")).resolves.toMatchObject({
      title: "Statuses & who acts",
      source: "Help: Statuses & who acts",
    });
  });

  test("an approver can't read the IT or Admin pages", async () => {
    const description = toolsFor(ctx(["approver"])).getAppHelp.description!;
    expect(description).toContain("- reports:");
    expect(description).not.toContain("- admin:");
    expect(description).not.toContain("- onboarding:");
    await expect(run(["approver"], "admin")).resolves.toEqual({
      error: "No such help page.",
    });
  });

  test("an admin reads every page", () => {
    const description = toolsFor(ctx(["admin"])).getAppHelp.description!;
    expect(description).toContain("- admin:");
    expect(description).toContain("- onboarding:");
  });
});

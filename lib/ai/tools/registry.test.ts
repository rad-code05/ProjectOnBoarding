// @vitest-environment node
import { describe, expect, test } from "vitest";
import type { Role } from "@/lib/auth";
import { TOOLS, toolApprovalFor, toolNamesFor, toolsFor } from "./registry";
import { defineTool } from "./types";

const ctx = (roles: Role[]) => ({
  userId: "user_1",
  roles,
  timeZone: "Asia/Dubai",
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
      expect(["read", "propose", "write"]).toContain(t.kind);
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
    expect(toolNamesFor(["approver"])).toEqual(["getAppHelp"]);
    expect(toolNamesFor([])).toEqual([]);
    expect(Object.keys(toolsFor(ctx(["approver"])))).toEqual(["getAppHelp"]);
  });

  test("approvals: only write tools wait for a Confirm (none yet in F15)", () => {
    expect(toolApprovalFor(["admin", "requester", "it_operator"])).toEqual({});
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

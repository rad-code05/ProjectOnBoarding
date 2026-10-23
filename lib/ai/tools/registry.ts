import type { ToolSet } from "ai";
import type { Role } from "@/lib/auth";
import { getAppHelp } from "./get-app-help";
import { runReport } from "./run-report";
import { hasAnyRole, type AiTool, type ToolContext } from "./types";

/**
 * Every assistant tool (PROJECT_PLAN §6.6). Add a tool = one file in
 * `lib/ai/tools/` + one line here. Never a tool: sign, confirm, return,
 * close, cancel, tick section 9, change roles or settings, delete, raw SQL,
 * web search — the tests check the names.
 */
export const TOOLS: readonly AiTool[] = [getAppHelp, runReport];

const allowedFor = (roles: readonly Role[]) =>
  TOOLS.filter((t) => hasAnyRole(roles, t.roles));

/** Names of the tools these roles may use. */
export function toolNamesFor(roles: readonly Role[]): string[] {
  return allowedFor(roles).map((t) => t.name);
}

/**
 * The tools the model gets for this person — only those their roles allow;
 * tools a role may not use are never sent.
 */
export function toolsFor(ctx: ToolContext): ToolSet {
  return Object.fromEntries(
    allowedFor(ctx.roles).map((t) => [t.name, t.build(ctx)]),
  );
}

/**
 * `streamText({ toolApproval })` (AI SDK 7 — tool-level `needsApproval` is
 * deprecated): every write tool waits for the person's Confirm.
 */
export function toolApprovalFor(
  roles: readonly Role[],
): Record<string, "user-approval"> {
  return Object.fromEntries(
    allowedFor(roles)
      .filter((t) => t.needsApproval)
      .map((t) => [t.name, "user-approval" as const]),
  );
}

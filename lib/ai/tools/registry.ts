import type { ToolSet } from "ai";
import type { Role } from "@/lib/auth";
import { getAppHelp } from "./get-app-help";
import { getCatalog } from "./get-catalog";
import { getPersonAccess } from "./get-person-access";
import { getRequest } from "./get-request";
import { listRequests } from "./list-requests";
import { rememberPreference } from "./remember-preference";
import { rememberQuestion } from "./remember-question";
import { runReport } from "./run-report";
import { searchPeople } from "./search-people";
import { whoHasAccess } from "./who-has-access";
import { hasAnyRole, type AiTool, type ToolContext } from "./types";

/**
 * Every assistant tool (PROJECT_PLAN §6.6). Add a tool = one file in
 * `lib/ai/tools/` + one line here. Never a tool: sign, confirm, return,
 * close, cancel, tick section 9, change roles or settings, delete, raw SQL,
 * web search — the tests check the names.
 */
export const TOOLS: readonly AiTool[] = [
  getAppHelp,
  runReport,
  // People & access — the IT side only, never approvers (F15d-2a).
  searchPeople,
  getPersonAccess,
  whoHasAccess,
  getCatalog,
  // Requests — the IT side only (F15d-2b).
  listRequests,
  getRequest,
  // Memory — the asker's own row only (F15d-2c).
  rememberPreference,
  rememberQuestion,
];

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

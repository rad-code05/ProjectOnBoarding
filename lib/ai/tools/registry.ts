import type { ToolApprovalStatus, ToolSet } from "ai";
import type { Role } from "@/lib/auth";
import { getAppHelp } from "./get-app-help";
import { createOnboardingDraft } from "./create-onboarding-draft";
import { getCatalog } from "./get-catalog";
import { getFormOptions } from "./get-form-options";
import { getPersonAccess } from "./get-person-access";
import { getRequest } from "./get-request";
import { listRequests } from "./list-requests";
import { nationalityBreakdown } from "./nationality-breakdown";
import { rememberPreference } from "./remember-preference";
import { rememberQuestion } from "./remember-question";
import { runReport } from "./run-report";
import { saveCustomReport } from "./save-custom-report";
import { searchPeople } from "./search-people";
import { suggestValues } from "./suggest-values";
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
  nationalityBreakdown,
  // Custom reports — report readers, their own reports only (F17a).
  saveCustomReport,
  // People & access — the IT side only, never approvers (F15d-2a).
  searchPeople,
  getPersonAccess,
  whoHasAccess,
  getCatalog,
  // Requests — the IT side only (F15d-2b).
  listRequests,
  getRequest,
  // Filling requests — admin / requester; creating a draft waits for Confirm (F16c).
  getFormOptions,
  createOnboardingDraft,
  suggestValues,
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

export type ApprovalRule =
  "user-approval" | ((input: unknown) => Promise<ToolApprovalStatus>);

/**
 * `streamText({ toolApproval })` (AI SDK 7 — tool-level `needsApproval` is
 * deprecated): every write tool waits for the person's Confirm. A tool with
 * a precheck is refused at once (with the reason, for the model) while
 * something is missing — the Confirm card only shows a complete request.
 */
export function toolApprovalFor(
  ctx: ToolContext,
): Record<string, ApprovalRule> {
  return Object.fromEntries(
    allowedFor(ctx.roles)
      .filter((t) => t.needsApproval)
      .map((t) => {
        const check = t.precheck;
        const rule: ApprovalRule = check
          ? async (input) => {
              const reason = await check(input, ctx);
              return reason
                ? { type: "denied" as const, reason }
                : "user-approval";
            }
          : "user-approval";
        return [t.name, rule];
      }),
  );
}

import type { Tool } from "ai";
import type { Role } from "@/lib/auth";

/** read = looks something up; propose = a suggestion the person accepts; write = changes data (always needs a Confirm). */
export type ToolKind = "read" | "propose" | "write";

/** Who is asking — every tool runs with this person's own session (RLS). */
export type ToolContext = {
  userId: string;
  roles: Role[];
  /** The company timezone (reports, dates in answers). */
  timeZone: string;
};

/**
 * One assistant tool (PROJECT_PLAN §6.6): one file each in `lib/ai/tools/`.
 * `roles` decides who gets it — the registry never sends a tool to someone
 * whose roles don't allow it, and `build` re-checks on the server anyway.
 */
export type AiTool = {
  name: string;
  roles: readonly Role[];
  kind: ToolKind;
  /** Writes always wait for the person's Confirm (`toolApprovalFor` in the registry). */
  needsApproval: boolean;
  build: (ctx: ToolContext) => Tool;
};

export function defineTool<T extends AiTool>(tool: T): T {
  if (tool.kind === "write" && !tool.needsApproval) {
    throw new Error(`The write tool ${tool.name} must need approval.`);
  }
  return tool;
}

/** Everyone who may use the assistant. */
export const ALL_ROLES = [
  "admin",
  "requester",
  "it_operator",
  "approver",
  "auditor",
] as const satisfies readonly Role[];

export const hasAnyRole = (roles: readonly Role[], allowed: readonly Role[]) =>
  roles.some((r) => allowed.includes(r));

"use server";

import * as z from "zod";
import {
  loadRoleChanges,
  type RoleChangesPage,
} from "@/lib/approvals/role-changes";
import { requireRole } from "@/lib/auth";
import { PAGES } from "@/lib/navigation";
import { nudgeSender } from "@/lib/notifications/run";
import { ensureRecordPdf } from "@/lib/records/ensure";
import {
  approvalErrorMessage,
  confirmSchema,
  returnSchema,
  type ApprovalResult,
} from "@/lib/approvals/decide";
import type { Json } from "@/lib/supabase/database.types";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Confirm & sign: sends back the snapshot the approver reviewed. The database
 * checks everything again (not their own request, own signature, unchanged).
 */
export async function confirmRequest(input: {
  requestId: string;
  snapshot: Json;
}): Promise<ApprovalResult> {
  await requireRole("approver");
  const parsed = confirmSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, message: "This request is unknown." };
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.rpc("confirm_request", {
    p_request_id: parsed.data.requestId,
    p_reviewed: parsed.data.snapshot as Json,
  });
  if (error) {
    return {
      ok: false,
      message: approvalErrorMessage(error.code, error.message),
    };
  }
  nudgeSender();
  // The request is closed: make its PDF record now. If that fails, the
  // first download makes it instead (same snapshot, same result).
  try {
    await ensureRecordPdf(parsed.data.requestId);
  } catch (cause) {
    console.error("PDF record not made at closing", cause);
  }
  return { ok: true };
}

/** Return to Raju with a comment and the sections to fix. */
export async function returnRequest(input: {
  requestId: string;
  comment: string;
  sections: number[];
}): Promise<ApprovalResult> {
  await requireRole("approver");
  const parsed = returnSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Check the comment.",
    };
  }
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.rpc("return_request", {
    p_request_id: parsed.data.requestId,
    p_comment: parsed.data.comment,
    p_flagged: parsed.data.sections,
  });
  if (error) {
    return {
      ok: false,
      message: approvalErrorMessage(error.code, error.message),
    };
  }
  nudgeSender();
  return { ok: true };
}

/** Role changes card (F18d-2): the next, older page. */
export async function loadOlderRoleChanges(input: {
  before: string;
}): Promise<RoleChangesPage> {
  await requireRole(...PAGES.approvals.roles);
  const before = z.iso.datetime({ offset: true }).safeParse(input.before);
  if (!before.success) return { lines: [], before: null };
  return loadRoleChanges(before.data);
}

/** The approver has seen the role changes: "new" starts from now. */
export async function markRoleChangesSeen(): Promise<void> {
  await requireRole(...PAGES.approvals.roles);
  await createServerSupabaseClient().rpc("mark_role_changes_seen");
}

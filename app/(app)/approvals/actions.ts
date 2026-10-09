"use server";

import { requireRole } from "@/lib/auth";
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
  return { ok: true };
}

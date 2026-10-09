"use server";

import * as z from "zod";
import { requireRole } from "@/lib/auth";
import { loadSignatures } from "@/lib/profile/signatures";
import {
  signErrorMessage,
  signRequestSchema,
  type SignResult,
  type SigningReview,
} from "@/lib/requests/signing";
import type { Json } from "@/lib/supabase/database.types";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type ChecksJson = {
  state_ok: boolean;
  missing_fields: string[];
  checklist_complete: boolean;
  signature: { id: string } | null;
};

/**
 * Opens Review & sign: the snapshot that will be signed (from the database),
 * the blocking checks, the signer's active signature and the approvers.
 */
export async function loadSigningReview(
  requestId: string,
): Promise<
  { ok: true; review: SigningReview } | { ok: false; message: string }
> {
  await requireRole("admin", "it_operator");
  const id = z.uuid().safeParse(requestId);
  if (!id.success) return { ok: false, message: "This request is unknown." };

  const supabase = createServerSupabaseClient();
  const [checks, preview, approvers, signatures] = await Promise.all([
    supabase.rpc("signing_checks", { p_request_id: id.data }),
    supabase.rpc("request_snapshot_preview", { p_request_id: id.data }),
    supabase
      .from("user_roles")
      .select(
        "app_users!user_roles_clerk_user_id_fkey!inner(first_name, active)",
      )
      .eq("role", "approver")
      .eq("app_users.active", true),
    loadSignatures(),
  ]);
  if (checks.error || preview.error || !preview.data) {
    return { ok: false, message: "Could not open the review. Try again." };
  }

  const c = checks.data as unknown as ChecksJson;
  const active = signatures.versions.find((v) => v.id === c.signature?.id);
  return {
    ok: true,
    review: {
      snapshot: preview.data,
      stateOk: c.state_ok,
      missingFields: c.missing_fields,
      checklistComplete: c.checklist_complete,
      signature: active
        ? {
            kind: active.kind,
            source: active.source,
            typedText: active.typedText,
            previewUrl: active.previewUrl,
            detail: active.detail,
          }
        : null,
      // Approvers are listed for admins (RLS); others get the general wording.
      approvers: (approvers.data ?? [])
        .map((row) => row.app_users.first_name)
        .filter((name): name is string => Boolean(name)),
    },
  };
}

/**
 * Signs section 9 with the snapshot the person reviewed. The database checks
 * everything again and refuses if anything changed since the review.
 */
export async function signRequest(input: {
  requestId: string;
  snapshot: Json;
}): Promise<SignResult> {
  await requireRole("admin", "it_operator");
  const parsed = signRequestSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, message: "This request is unknown." };

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.rpc("sign_request", {
    p_request_id: parsed.data.requestId,
    p_reviewed: parsed.data.snapshot as Json,
  });
  if (error)
    return { ok: false, message: signErrorMessage(error.code, error.message) };
  return { ok: true };
}

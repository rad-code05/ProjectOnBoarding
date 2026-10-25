"use server";

import * as z from "zod";
import { requireRole } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * The assistant's suggestions on a request (F16b): Accept saves the value
 * the way typing would (the database function runs with the person's own
 * access — same checks, version + 1, audited source = ai); Reject leaves the
 * request as it was.
 */

export type SuggestionResult =
  { ok: true; version: number | null } | { ok: false; message: string };

const idSchema = z.uuid();

/** Database refusals → words for the person. */
function refusal(error: { code?: string; message: string }): SuggestionResult {
  if (error.code === "42501") {
    return { ok: false, message: "This request can't be changed any more." };
  }
  if (error.code === "22023") {
    return {
      ok: false,
      message: "This suggestion was already decided. Reload to see the latest.",
    };
  }
  if (error.code === "23514") {
    return {
      ok: false,
      message:
        "That value isn't allowed here. Reject it and choose one yourself.",
    };
  }
  return {
    ok: false,
    message: "Could not save. Check your connection and try again.",
  };
}

export async function acceptSuggestion(id: string): Promise<SuggestionResult> {
  await requireRole("admin", "requester", "it_operator");
  if (!idSchema.safeParse(id).success) {
    return { ok: false, message: "This suggestion is unknown." };
  }
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.rpc("accept_request_suggestion", {
    p_id: id,
  });
  if (error) return refusal(error);
  const version = (data as { version?: number } | null)?.version;
  return { ok: true, version: typeof version === "number" ? version : null };
}

export async function rejectSuggestion(id: string): Promise<SuggestionResult> {
  await requireRole("admin", "requester", "it_operator");
  if (!idSchema.safeParse(id).success) {
    return { ok: false, message: "This suggestion is unknown." };
  }
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.rpc("reject_request_suggestion", {
    p_id: id,
  });
  return error ? refusal(error) : { ok: true, version: null };
}

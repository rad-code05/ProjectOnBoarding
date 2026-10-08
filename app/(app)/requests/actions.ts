"use server";

import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import {
  draftValuesSchema,
  fieldErrorsOf,
  saveDraftSchema,
  toColumns,
  type DraftFormValues,
  type SaveDraftResult,
} from "@/lib/requests/draft";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { TablesInsert } from "@/lib/supabase/database.types";

/** New request → an empty onboarding draft, then its form. */
export async function createDraft() {
  const { userId } = await requireRole("admin", "requester");
  const supabase = createServerSupabaseClient();
  // Ticket ID/year/number and the form version are set by the database
  // (trigger request_before_insert); the generated types can't know that.
  const draft = { created_by: userId } as TablesInsert<"requests">;
  const { data, error } = await supabase
    .from("requests")
    .insert(draft)
    .select("id")
    .single();
  if (error) throw new Error(`Could not create the request: ${error.message}`);
  redirect(`/requests/${data.id}`);
}

/**
 * Saves the form's values — only if the request still has the version the
 * form was loaded with (optimistic locking). Otherwise nothing is written and
 * the form says it was changed somewhere else. The audit log entry is written
 * by the database trigger.
 */
export async function saveDraft(input: {
  id: string;
  version: number;
  values: DraftFormValues;
}): Promise<SaveDraftResult> {
  await requireRole("admin", "requester", "it_operator");

  const target = saveDraftSchema.safeParse(input);
  if (!target.success) {
    return { ok: false, reason: "error", message: "This request is unknown." };
  }
  const values = draftValuesSchema.safeParse(input.values);
  if (!values.success) {
    return {
      ok: false,
      reason: "invalid",
      fieldErrors: fieldErrorsOf(values.error),
    };
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("requests")
    .update(toColumns(values.data))
    .eq("id", target.data.id)
    .eq("version", target.data.version)
    .select("version, updated_at")
    .maybeSingle();
  if (error) {
    return {
      ok: false,
      reason: "error",
      message: "Could not save. Check your connection and try again.",
    };
  }
  if (!data) {
    return {
      ok: false,
      reason: "conflict",
      message:
        "This request was changed somewhere else (another tab or device), so your change was not saved. Reload to see the latest version.",
    };
  }
  return { ok: true, version: data.version, savedAt: data.updated_at };
}

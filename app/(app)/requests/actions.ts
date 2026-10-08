"use server";

import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import {
  clearAccessSchema,
  setAccessSchema,
  type AccessResult,
} from "@/lib/requests/access";
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

/** Database refusals → words for the person (the database has the last say). */
function accessError(code: string | undefined): AccessResult {
  if (code === "23514") {
    return { ok: false, message: "That option isn't offered for this app." };
  }
  if (code === "42501") {
    return { ok: false, message: "This request can't be changed any more." };
  }
  return {
    ok: false,
    message: "Could not save. Check your connection and try again.",
  };
}

/**
 * Section 5: sets one app's action / permission / notes on a request. The
 * database checks them against that app's own options and keeps a copy of
 * the app name; every change is audited by a trigger.
 */
export async function setAccess(input: {
  requestId: string;
  appId: number;
  action: string;
  permission: string | null;
  notes: string | null;
}): Promise<AccessResult> {
  await requireRole("admin", "requester", "it_operator");
  const parsed = setAccessSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "That choice isn't valid." };
  }
  const { requestId, appId, action, permission, notes } = parsed.data;
  const supabase = createServerSupabaseClient();

  const existing = await supabase
    .from("request_access_items")
    .select("id")
    .eq("request_id", requestId)
    .eq("app_id", appId)
    .maybeSingle();
  if (existing.error) return accessError(existing.error.code);

  const { error } = existing.data
    ? await supabase
        .from("request_access_items")
        .update({ action, permission, notes })
        .eq("id", existing.data.id)
    : await supabase.from("request_access_items").insert(
        // App name and category are copied from the catalog by the database
        // (trigger access_item_before_write); the types can't know that.
        {
          request_id: requestId,
          app_id: appId,
          action,
          permission,
          notes,
        } as TablesInsert<"request_access_items">,
      );
  return error ? accessError(error.code) : { ok: true };
}

/** Section 5 "Clear": the app is no longer part of this request (audited). */
export async function clearAccess(input: {
  requestId: string;
  appId: number;
}): Promise<AccessResult> {
  await requireRole("admin", "requester", "it_operator");
  const parsed = clearAccessSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Unknown app." };
  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("request_access_items")
    .delete()
    .eq("request_id", parsed.data.requestId)
    .eq("app_id", parsed.data.appId);
  return error ? accessError(error.code) : { ok: true };
}
